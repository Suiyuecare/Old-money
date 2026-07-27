import { getAdminAuthClient } from "@/lib/admin/auth";
import type { AdminIdentity } from "@/lib/admin/types";
import { getCommerceEnvironment } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  DeterministicIdempotencyStore,
  hashIdempotencyRequest,
} from "@/lib/commerce/idempotency";

import { SupabaseMediaCommandCoordinator } from "./commands";
import type { MediaActor, MediaCommandCoordinator } from "./commands";
import {
  MAX_SOURCE_IMAGE_BYTES,
  createDeliveryPath,
  createDerivedObjectPath,
  createSourceObjectPath,
  createUploadIntentId,
  type CreateUploadIntentInput,
  type FinalizeUploadInput,
  type FinalizedMedia,
  type MediaDerivativeDescriptor,
  type MediaUploadIntent,
} from "./contracts";
import { processSourceImage } from "./image-processor";
import {
  SupabaseMediaStorage,
  getMediaStorageBindings,
  type MediaStorage,
} from "./storage";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";

export interface MediaPipeline {
  createUploadIntent(
    actor: MediaActor,
    input: CreateUploadIntentInput,
  ): Promise<MediaUploadIntent>;
  finalizeUpload(
    actor: MediaActor,
    input: FinalizeUploadInput,
  ): Promise<FinalizedMedia>;
}

export class StorageMediaPipeline implements MediaPipeline {
  constructor(
    private readonly storage: MediaStorage,
    private readonly commands: MediaCommandCoordinator,
  ) {}

  async createUploadIntent(
    actor: MediaActor,
    input: CreateUploadIntentInput,
  ): Promise<MediaUploadIntent> {
    const intentId = createUploadIntentId({
      actorId: actor.userId,
      scope: input.scope,
      entityId: input.entityId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
    });
    const sourcePath = createSourceObjectPath({
      scope: input.scope,
      entityId: input.entityId,
      intentId,
      contentType: input.contentType,
    });
    await this.commands.reserveUploadIntent({
      actor,
      command: input,
      intentId,
      sourcePath,
    });
    const grant = await this.storage.createSignedUpload({
      scope: input.scope,
      sourcePath,
    });
    return Object.freeze({
      mode: "storage",
      persisted: true,
      intentId,
      sourcePath,
      signedUploadUrl: grant.signedUrl,
      signedUploadToken: grant.token,
      // Supabase signed upload URLs currently expire after two hours.
      expiresInSeconds: 2 * 60 * 60,
      maximumBytes: MAX_SOURCE_IMAGE_BYTES,
      acceptedContentType: input.contentType,
      message: "Private upload intent created.",
    });
  }

  async finalizeUpload(
    actor: MediaActor,
    input: FinalizeUploadInput,
  ): Promise<FinalizedMedia> {
    const sourceBytes = await this.storage.downloadSource({
      scope: input.scope,
      sourcePath: input.sourcePath,
    });
    if (sourceBytes.byteLength !== input.sizeBytes) {
      throw new CommerceDomainError(
        "SOURCE_IMAGE_SIZE_MISMATCH",
        "The uploaded source size differs from the upload intent.",
        409,
      );
    }
    const processed = await processSourceImage(
      sourceBytes,
      input.contentType,
    );
    const prepared = processed.derivatives.map((derivative) => {
      const objectPath = createDerivedObjectPath({
        scope: input.scope,
        sha256: processed.sha256,
        width: derivative.variantWidth,
        format: derivative.format,
      });
      const descriptor = Object.freeze({
        width: derivative.variantWidth,
        renderedWidth: derivative.width,
        height: derivative.height,
        format: derivative.format,
        byteLength: derivative.bytes.byteLength,
        objectPath,
        deliveryPath: createDeliveryPath({
          scope: input.scope,
          sha256: processed.sha256,
          width: derivative.variantWidth,
          format: derivative.format,
        }),
      }) satisfies MediaDerivativeDescriptor;
      return Object.freeze({ derivative, descriptor });
    });
    const descriptors = prepared.map((item) => item.descriptor);

    // Persist cleanup candidates before the first Storage write. A crash,
    // failed upload, or lost finalize response therefore leaves a durable,
    // delayed cleanup record instead of an invisible derivative object.
    await this.commands.stageDerivativeCleanup({
      actor,
      command: input,
      sha256: processed.sha256,
      derivatives: descriptors,
    });

    for (const { derivative, descriptor } of prepared) {
      await this.storage.putDerivative({
        scope: input.scope,
        objectPath: descriptor.objectPath,
        contentType: derivative.contentType,
        bytes: derivative.bytes,
      });
    }
    const registration = await this.commands.registerFinalizedMedia({
      actor,
      command: input,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
      sourceByteLength: processed.sourceByteLength,
      derivatives: descriptors,
    });
    return Object.freeze({
      mode: "storage",
      persisted: true,
      processed: true,
      intentId: input.intentId,
      sourcePath: input.sourcePath,
      sha256: processed.sha256,
      original: {
        contentType: processed.sourceContentType,
        byteLength: processed.sourceByteLength,
        width: processed.width,
        height: processed.height,
      },
      derivatives: Object.freeze(descriptors),
      mediaAssetId: registration.mediaAssetId,
      replayed: registration.replayed,
      message: "Private source normalized and derivatives stored.",
    });
  }
}

interface DemoMediaGlobal {
  [demoMediaStateKey]?: {
    readonly intents: DeterministicIdempotencyStore;
    readonly finalizations: DeterministicIdempotencyStore;
  };
}

const demoMediaStateKey = Symbol.for("lignee.demo-media-pipeline.v1");

function getDemoStores() {
  const globalObject = globalThis as DemoMediaGlobal;
  globalObject[demoMediaStateKey] ??= {
    intents: new DeterministicIdempotencyStore({
      maximumRecords: 128,
      ttlMs: 30 * 60_000,
    }),
    finalizations: new DeterministicIdempotencyStore({
      maximumRecords: 128,
      ttlMs: 30 * 60_000,
    }),
  };
  return globalObject[demoMediaStateKey];
}

export class DemoMediaPipeline implements MediaPipeline {
  async createUploadIntent(
    actor: MediaActor,
    input: CreateUploadIntentInput,
  ): Promise<MediaUploadIntent> {
    const request = {
      ...input,
      requestHash: hashIdempotencyRequest(input),
    };
    return getDemoStores().intents.execute<MediaUploadIntent>(
      {
        actorScope: `admin:${actor.userId}`,
        commandName: "media.upload-intent.demo",
        key: input.idempotencyKey,
        request,
      },
      () => {
        const intentId = createUploadIntentId({
          actorId: actor.userId,
          scope: input.scope,
          entityId: input.entityId,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
        });
        return Object.freeze({
          mode: "demo",
          persisted: false,
          intentId,
          sourcePath: createSourceObjectPath({
            scope: input.scope,
            entityId: input.entityId,
            intentId,
            contentType: input.contentType,
          }),
          signedUploadUrl: null,
          signedUploadToken: null,
          expiresInSeconds: null,
          maximumBytes: MAX_SOURCE_IMAGE_BYTES,
          acceptedContentType: input.contentType,
          message:
            "Demo only: no signed URL was issued and no object was uploaded.",
        });
      },
    ).result;
  }

  async finalizeUpload(
    actor: MediaActor,
    input: FinalizeUploadInput,
  ): Promise<FinalizedMedia> {
    const execution = getDemoStores().finalizations.execute<FinalizedMedia>(
      {
        actorScope: `admin:${actor.userId}`,
        commandName: "media.finalize.demo",
        key: input.idempotencyKey,
        request: input,
      },
      () =>
        Object.freeze({
          mode: "demo",
          persisted: false,
          processed: false,
          intentId: input.intentId,
          sourcePath: input.sourcePath,
          sha256: null,
          original: {
            contentType: input.contentType,
            byteLength: input.sizeBytes,
            width: null,
            height: null,
          },
          derivatives: Object.freeze([]),
          mediaAssetId: null,
          replayed: false,
          message:
            "Demo only: no source was downloaded, transformed, or stored.",
        }),
    );
    return execution.replayed
      ? Object.freeze({ ...execution.result, replayed: true })
      : execution.result;
  }
}

let demoPipeline: DemoMediaPipeline | undefined;

export async function getRequestMediaPipeline(): Promise<MediaPipeline> {
  const environment = getCommerceEnvironment();
  if (environment.mode === "demo" && process.env.NODE_ENV !== "production") {
    demoPipeline ??= new DemoMediaPipeline();
    return demoPipeline;
  }
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new CommerceDomainError(
      "MEDIA_PIPELINE_UNAVAILABLE",
      "Authenticated private media storage is unavailable.",
      503,
    );
  }
  const client = await getAdminAuthClient();
  return new StorageMediaPipeline(
    // Storage objects are written and read only by this authenticated server
    // pipeline. The administrator JWT is used solely for the command RPCs so
    // direct bucket access cannot bypass media state transitions.
    new SupabaseMediaStorage(
      getPrivilegedSupabaseClient(),
      getMediaStorageBindings(),
    ),
    new SupabaseMediaCommandCoordinator(client),
  );
}

export function mediaActorFromAdmin(identity: AdminIdentity): MediaActor {
  return Object.freeze({ userId: identity.userId });
}
