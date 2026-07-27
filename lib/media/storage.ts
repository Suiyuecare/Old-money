import type { SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

import { CommerceDomainError } from "@/lib/commerce/errors";

import type {
  MediaScope,
  SourceImageContentType,
} from "./contracts";
import {
  isSafeDerivedObjectPath,
  isSafeSourceObjectPath,
} from "./contracts";

export interface SignedUploadGrant {
  readonly signedUrl: string;
  readonly token: string;
}

export interface MediaStorage {
  createSignedUpload(input: {
    readonly scope: MediaScope;
    readonly sourcePath: string;
  }): Promise<SignedUploadGrant>;
  downloadSource(input: {
    readonly scope: MediaScope;
    readonly sourcePath: string;
  }): Promise<Buffer>;
  putDerivative(input: {
    readonly scope: MediaScope;
    readonly objectPath: string;
    readonly contentType: "image/webp" | "image/avif";
    readonly bytes: Buffer;
  }): Promise<void>;
  removeUnregisteredMediaObject(input: {
    readonly scope: MediaScope;
    readonly objectKind: "derivative" | "source";
    readonly objectPath: string;
  }): Promise<void>;
}

export interface MediaStorageBindings {
  readonly productSourceBucket: string;
  readonly productDerivativeBucket: string;
  readonly supportAttachmentBucket: string;
}

function requiredBucketName(
  value: string | undefined,
  variableName: string,
): string {
  if (
    !value ||
    !/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(value)
  ) {
    throw new CommerceDomainError(
      "MEDIA_STORAGE_UNAVAILABLE",
      `Private media storage binding ${variableName} is unavailable.`,
      503,
    );
  }
  return value;
}

export function getMediaStorageBindings(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): MediaStorageBindings {
  return Object.freeze({
    productSourceBucket: requiredBucketName(
      environment.SUPABASE_CATALOG_SOURCE_BUCKET,
      "SUPABASE_CATALOG_SOURCE_BUCKET",
    ),
    productDerivativeBucket: requiredBucketName(
      environment.SUPABASE_CATALOG_MEDIA_BUCKET,
      "SUPABASE_CATALOG_MEDIA_BUCKET",
    ),
    supportAttachmentBucket: requiredBucketName(
      environment.SUPABASE_SUPPORT_ATTACHMENTS_BUCKET,
      "SUPABASE_SUPPORT_ATTACHMENTS_BUCKET",
    ),
  });
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bindings: MediaStorageBindings,
  ) {}

  async createSignedUpload(input: {
    readonly scope: MediaScope;
    readonly sourcePath: string;
  }): Promise<SignedUploadGrant> {
    const bucket = this.sourceBucket(input.scope);
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(input.sourcePath, { upsert: false });
    if (error || !data) {
      throw new CommerceDomainError(
        "MEDIA_UPLOAD_GRANT_FAILED",
        "Private upload could not be authorized.",
        503,
      );
    }
    return Object.freeze({
      signedUrl: data.signedUrl,
      token: data.token,
    });
  }

  async downloadSource(input: {
    readonly scope: MediaScope;
    readonly sourcePath: string;
  }): Promise<Buffer> {
    const bucket = this.sourceBucket(input.scope);
    const { data, error } = await this.client.storage
      .from(bucket)
      .download(input.sourcePath, {}, { cache: "no-store" });
    if (error || !data) {
      throw new CommerceDomainError(
        "MEDIA_SOURCE_NOT_FOUND",
        "The private source image is unavailable.",
        404,
      );
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    return bytes;
  }

  async putDerivative(input: {
    readonly scope: MediaScope;
    readonly objectPath: string;
    readonly contentType: "image/webp" | "image/avif";
    readonly bytes: Buffer;
  }): Promise<void> {
    const bucket = this.derivativeBucket(input.scope);
    const { error } = await this.client.storage.from(bucket).upload(
      input.objectPath,
      input.bytes,
      {
        cacheControl: "31536000",
        contentType: input.contentType,
        // Derivatives are content addressed. Replacing bytes at an existing
        // SHA path would bypass media review and cache invalidation.
        upsert: false,
        metadata: {
          pipeline: "lignee-media-v1",
          metadataStripped: true,
        },
      },
    );
    if (!error) return;

    // A retry or a second product may legitimately produce the same
    // derivative. Accept it only when the immutable object is byte-identical.
    const { data: existing, error: downloadError } =
      await this.client.storage
        .from(bucket)
        .download(input.objectPath, {}, { cache: "no-store" });
    if (downloadError || !existing) {
      throw new CommerceDomainError(
        "MEDIA_DERIVATIVE_UPLOAD_FAILED",
        "A private derivative could not be stored.",
        503,
      );
    }
    const existingBytes = Buffer.from(await existing.arrayBuffer());
    if (
      existingBytes.byteLength !== input.bytes.byteLength ||
      !timingSafeEqual(existingBytes, input.bytes)
    ) {
      throw new CommerceDomainError(
        "MEDIA_DERIVATIVE_IMMUTABILITY_CONFLICT",
        "An existing content-addressed derivative has different bytes.",
        409,
      );
    }
  }

  async removeUnregisteredMediaObject(input: {
    readonly scope: MediaScope;
    readonly objectKind: "derivative" | "source";
    readonly objectPath: string;
  }): Promise<void> {
    const validPath = input.objectKind === "derivative"
      ? isSafeDerivedObjectPath(input.scope, input.objectPath)
      : (
          isSafeSourceObjectPath(input.objectPath)
          && input.objectPath.split("/")[1] === input.scope
        );
    if (!validPath) {
      throw new CommerceDomainError(
        "INVALID_MEDIA_CLEANUP_PATH",
        "Media cleanup refused an invalid private object path.",
        400,
      );
    }
    const bucket = input.objectKind === "derivative"
      ? this.derivativeBucket(input.scope)
      : this.sourceBucket(input.scope);
    const { error } = await this.client.storage
      .from(bucket)
      .remove([input.objectPath]);
    if (error) {
      throw new CommerceDomainError(
        "MEDIA_ORPHAN_DELETE_FAILED",
        "An unreferenced private media object could not be removed.",
        503,
      );
    }
  }

  private sourceBucket(scope: MediaScope): string {
    return scope === "product"
      ? this.bindings.productSourceBucket
      : this.bindings.supportAttachmentBucket;
  }

  private derivativeBucket(scope: MediaScope): string {
    return scope === "product"
      ? this.bindings.productDerivativeBucket
      : this.bindings.supportAttachmentBucket;
  }
}

export function acceptedSourceContentType(
  contentType: string,
): SourceImageContentType {
  if (
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp" ||
    contentType === "image/avif"
  ) {
    return contentType;
  }
  throw new CommerceDomainError(
    "UNSUPPORTED_SOURCE_IMAGE",
    "The source content type is unsupported.",
    415,
  );
}
