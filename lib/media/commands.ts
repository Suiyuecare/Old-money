import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { hashIdempotencyRequest } from "@/lib/commerce/idempotency";

import type {
  CreateUploadIntentInput,
  FinalizeUploadInput,
  MediaDerivativeDescriptor,
} from "./contracts";
import { validateMediaDerivativeManifest } from "./contracts";

export interface MediaActor {
  readonly userId: string;
}

export interface MediaCommandCoordinator {
  reserveUploadIntent(input: {
    readonly actor: MediaActor;
    readonly command: CreateUploadIntentInput;
    readonly intentId: string;
    readonly sourcePath: string;
  }): Promise<{ readonly replayed: boolean }>;
  stageDerivativeCleanup(input: {
    readonly actor: MediaActor;
    readonly command: FinalizeUploadInput;
    readonly sha256: string;
    readonly derivatives: readonly MediaDerivativeDescriptor[];
  }): Promise<{ readonly replayed: boolean }>;
  registerFinalizedMedia(input: {
    readonly actor: MediaActor;
    readonly command: FinalizeUploadInput;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
    readonly sourceByteLength: number;
    readonly derivatives: readonly MediaDerivativeDescriptor[];
  }): Promise<{
    readonly mediaAssetId: string | null;
    readonly replayed: boolean;
  }>;
}

function rpcFailure(error: { readonly message?: string } | null): never {
  const message = error?.message ?? "";
  if (
    message.includes("ROW_VERSION_CONFLICT") ||
    message.includes("IDEMPOTENCY_KEY_CONFLICT") ||
    message.includes("IDEMPOTENCY_COMMAND_IN_PROGRESS")
  ) {
    throw new CommerceDomainError(
      message.includes("ROW_VERSION_CONFLICT")
        ? "VERSION_CONFLICT"
        : "IDEMPOTENCY_CONFLICT",
      message.includes("ROW_VERSION_CONFLICT")
        ? "The media parent changed; reload before uploading."
        : "This idempotency key is already committed to another command.",
      409,
    );
  }
  if (
    message.includes("MEDIA_ORPHAN_CLEANUP_IN_PROGRESS") ||
    message.includes("MEDIA_DERIVATIVES_REQUIRE_REUPLOAD") ||
    message.includes("MEDIA_SOURCE_REQUIRES_REUPLOAD")
  ) {
    throw new CommerceDomainError(
      "MEDIA_CLEANUP_CONFLICT",
      "Media cleanup is in progress; retry the full upload after it finishes.",
      409,
    );
  }
  if (
    message.includes("ADMIN_ROLE_DENIED") ||
    message.includes("ADMIN_AAL2_REQUIRED") ||
    message.includes("ADMIN_MEMBERSHIP_REQUIRED")
  ) {
    throw new CommerceDomainError(
      "MEDIA_COMMAND_FORBIDDEN",
      "The current administrator may not perform this media command.",
      403,
    );
  }
  throw new CommerceDomainError(
    "MEDIA_COMMAND_UNAVAILABLE",
    "The durable media command service is unavailable.",
    503,
  );
}

function parseCommandResult(value: unknown): {
  readonly mediaAssetId: string | null;
  readonly replayed: boolean;
} {
  const record =
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!record || typeof record !== "object") {
    throw new CommerceDomainError(
      "MEDIA_COMMAND_INVALID_RESPONSE",
      "The durable media command returned an invalid response.",
      503,
    );
  }
  const object = record as Record<string, unknown>;
  const id = object.mediaAssetId ?? object.id ?? null;
  if (id !== null && typeof id !== "string") {
    throw new CommerceDomainError(
      "MEDIA_COMMAND_INVALID_RESPONSE",
      "The durable media command returned an invalid asset ID.",
      503,
    );
  }
  return Object.freeze({
    mediaAssetId: id,
    replayed: object.replayed === true,
  });
}

export class SupabaseMediaCommandCoordinator
  implements MediaCommandCoordinator
{
  constructor(private readonly client: SupabaseClient) {}

  async reserveUploadIntent(input: {
    readonly actor: MediaActor;
    readonly command: CreateUploadIntentInput;
    readonly intentId: string;
    readonly sourcePath: string;
  }): Promise<{ readonly replayed: boolean }> {
    const request = {
      scope: input.command.scope,
      entityId: input.command.entityId,
      expectedVersion: input.command.expectedVersion,
      fileName: input.command.fileName,
      contentType: input.command.contentType,
      sizeBytes: input.command.sizeBytes,
      intentId: input.intentId,
      sourcePath: input.sourcePath,
    };
    const { data, error } = await this.client
      .schema("api")
      .rpc("admin_media_upload_intent_reserve", {
        p_idempotency_key: input.command.idempotencyKey,
        p_request_hash: hashIdempotencyRequest(request),
        p_scope: input.command.scope,
        p_entity_id: input.command.entityId,
        p_expected_version: input.command.expectedVersion,
        p_source_path: input.sourcePath,
        p_payload: request,
      });
    if (error) rpcFailure(error);
    const parsed = parseCommandResult(data);
    return Object.freeze({ replayed: parsed.replayed });
  }

  async stageDerivativeCleanup(input: {
    readonly actor: MediaActor;
    readonly command: FinalizeUploadInput;
    readonly sha256: string;
    readonly derivatives: readonly MediaDerivativeDescriptor[];
  }): Promise<{ readonly replayed: boolean }> {
    const derivatives = validateMediaDerivativeManifest(input.derivatives);
    const request = {
      scope: input.command.scope,
      entityId: input.command.entityId,
      expectedVersion: input.command.expectedVersion,
      intentId: input.command.intentId,
      sha256: input.sha256,
      derivatives,
    };
    // A later retry may legitimately need to reset already-deleted candidates
    // and upload the same content again. Give each staging invocation its own
    // durable receipt, while replaying the exact key once if the RPC response
    // is lost.
    const stageKey = `media-cleanup-stage:${randomUUID()}`;
    const args = {
      p_idempotency_key: stageKey,
      p_request_hash: hashIdempotencyRequest({
        finalizeKey: input.command.idempotencyKey,
        ...request,
      }),
      p_scope: input.command.scope,
      p_entity_id: input.command.entityId,
      p_expected_version: input.command.expectedVersion,
      p_intent_id: input.command.intentId,
      p_sha256: input.sha256,
      p_derivatives: derivatives,
    };
    let response = await this.client
      .schema("api")
      .rpc("admin_media_orphan_cleanup_stage", args);
    if (response.error) {
      response = await this.client
        .schema("api")
        .rpc("admin_media_orphan_cleanup_stage", args);
    }
    const { data, error } = response;
    if (error) rpcFailure(error);
    const parsed = parseCommandResult(data);
    return Object.freeze({ replayed: parsed.replayed });
  }

  async registerFinalizedMedia(input: {
    readonly actor: MediaActor;
    readonly command: FinalizeUploadInput;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
    readonly sourceByteLength: number;
    readonly derivatives: readonly MediaDerivativeDescriptor[];
  }): Promise<{
    readonly mediaAssetId: string | null;
    readonly replayed: boolean;
  }> {
    const derivatives = validateMediaDerivativeManifest(input.derivatives);
    const payload = {
      intentId: input.command.intentId,
      sourcePath: input.command.sourcePath,
      fileName: input.command.fileName,
      contentType: input.command.contentType,
      sizeBytes: input.sourceByteLength,
      sha256: input.sha256,
      width: input.width,
      height: input.height,
      derivatives,
      status: "draft",
    };
    const { data, error } = await this.client
      .schema("api")
      .rpc("admin_media_finalize", {
        p_idempotency_key: input.command.idempotencyKey,
        p_request_hash: hashIdempotencyRequest({
          scope: input.command.scope,
          entityId: input.command.entityId,
          expectedVersion: input.command.expectedVersion,
          ...payload,
        }),
        p_scope: input.command.scope,
        p_entity_id: input.command.entityId,
        p_expected_version: input.command.expectedVersion,
        p_payload: payload,
      });
    if (error) rpcFailure(error);
    return parseCommandResult(data);
  }
}
