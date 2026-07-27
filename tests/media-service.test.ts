import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { CommerceDomainError } from "@/lib/commerce/errors";
import type {
  MediaCommandCoordinator,
  MediaActor,
} from "@/lib/media/commands";
import {
  createSourceObjectPath,
  createUploadIntentId,
  type CreateUploadIntentInput,
  type FinalizeUploadInput,
  type MediaDerivativeDescriptor,
} from "@/lib/media/contracts";
import {
  DemoMediaPipeline,
  StorageMediaPipeline,
} from "@/lib/media/service";
import type {
  MediaStorage,
  SignedUploadGrant,
} from "@/lib/media/storage";

const actor: MediaActor = {
  userId: "3c191841-156d-440e-9b84-02bd3eeb1ffd",
};

const intentCommand: CreateUploadIntentInput = {
  scope: "product",
  entityId: "d6df27a1-5a8b-4545-b3c4-c6aeaf2ce951",
  fileName: "private-source.png",
  contentType: "image/png",
  sizeBytes: 1,
  expectedVersion: 7,
  idempotencyKey: "media-service-intent-0001",
};

class FakeStorage implements MediaStorage {
  readonly derivatives: {
    readonly scope: "product" | "support";
    readonly objectPath: string;
    readonly contentType: "image/webp" | "image/avif";
    readonly bytes: Buffer;
  }[] = [];

  constructor(readonly source: Buffer) {}

  async createSignedUpload(): Promise<SignedUploadGrant> {
    return {
      signedUrl: "https://storage.test/upload?token=private",
      token: "private-token",
    };
  }

  async downloadSource(): Promise<Buffer> {
    return this.source;
  }

  async putDerivative(
    input: (typeof this.derivatives)[number],
  ): Promise<void> {
    this.derivatives.push(input);
  }

  async removeUnregisteredMediaObject(): Promise<void> {}
}

class FakeCoordinator implements MediaCommandCoordinator {
  reserveCalls = 0;
  stageCalls = 0;
  finalizeCalls = 0;
  lastExpectedVersion: number | undefined;
  lastStagedDerivatives: readonly MediaDerivativeDescriptor[] = [];
  lastRegisteredDerivatives: readonly MediaDerivativeDescriptor[] = [];
  failStage = false;

  async reserveUploadIntent() {
    this.reserveCalls += 1;
    return { replayed: false };
  }

  async stageDerivativeCleanup(
    input: Parameters<
      MediaCommandCoordinator["stageDerivativeCleanup"]
    >[0],
  ) {
    this.stageCalls += 1;
    this.lastStagedDerivatives = input.derivatives;
    expect(input.derivatives).toHaveLength(6);
    if (this.failStage) {
      throw new CommerceDomainError(
        "MEDIA_CLEANUP_CONFLICT",
        "cleanup is already leased",
        409,
      );
    }
    return { replayed: false };
  }

  async registerFinalizedMedia(
    input: Parameters<
      MediaCommandCoordinator["registerFinalizedMedia"]
    >[0],
  ) {
    this.finalizeCalls += 1;
    this.lastExpectedVersion = input.command.expectedVersion;
    this.lastRegisteredDerivatives = input.derivatives;
    return {
      mediaAssetId: "12f54b7b-e1ef-4b82-8880-c0026ac0ecb4",
      replayed: false,
    };
  }
}

describe("media storage pipeline", () => {
  it("reserves a durable command before returning a private signed grant", async () => {
    const storage = new FakeStorage(Buffer.from("unused"));
    const commands = new FakeCoordinator();
    const pipeline = new StorageMediaPipeline(storage, commands);
    const response = await pipeline.createUploadIntent(actor, intentCommand);

    expect(commands.reserveCalls).toBe(1);
    expect(response).toMatchObject({
      mode: "storage",
      persisted: true,
      signedUploadUrl: "https://storage.test/upload?token=private",
      signedUploadToken: "private-token",
      maximumBytes: 20 * 1024 * 1024,
    });
    expect(response.sourcePath).toMatch(
      /^incoming\/product\/[A-Za-z0-9_-]+\/[a-f0-9]{64}\.png$/,
    );
  });

  it(
    "downloads only the bound source and stores six content-addressed private derivatives",
    async () => {
      const source = await sharp({
        create: {
          width: 96,
          height: 64,
          channels: 4,
          background: { r: 40, g: 55, b: 35, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const storage = new FakeStorage(source);
      const commands = new FakeCoordinator();
      const pipeline = new StorageMediaPipeline(storage, commands);
      const intentId = createUploadIntentId({
        actorId: actor.userId,
        scope: intentCommand.scope,
        entityId: intentCommand.entityId,
        expectedVersion: intentCommand.expectedVersion,
        idempotencyKey: intentCommand.idempotencyKey,
      });
      const sourcePath = createSourceObjectPath({
        scope: intentCommand.scope,
        entityId: intentCommand.entityId,
        intentId,
        contentType: intentCommand.contentType,
      });
      const finalize: FinalizeUploadInput = {
        ...intentCommand,
        sizeBytes: source.byteLength,
        idempotencyKey: "media-service-finalize-0001",
        intentId,
        sourcePath,
      };

      const result = await pipeline.finalizeUpload(actor, finalize);

      expect(result).toMatchObject({
        mode: "storage",
        persisted: true,
        processed: true,
        mediaAssetId: "12f54b7b-e1ef-4b82-8880-c0026ac0ecb4",
        original: {
          contentType: "image/png",
          byteLength: source.byteLength,
          width: 96,
          height: 64,
        },
      });
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(commands.stageCalls).toBe(1);
      expect(commands.finalizeCalls).toBe(1);
      expect(commands.lastExpectedVersion).toBe(7);
      expect(storage.derivatives).toHaveLength(6);
      for (const derivative of result.derivatives) {
        expect(derivative.renderedWidth).toBe(96);
        expect(derivative.renderedWidth).toBeLessThanOrEqual(derivative.width);
        expect(derivative.objectPath).toBe(
          `catalog/${result.sha256}/${derivative.width}.${derivative.format}`,
        );
        expect(derivative.deliveryPath).toBe(
          `/media/${result.sha256}/${derivative.width}.${derivative.format}`,
        );
      }
      expect(commands.lastStagedDerivatives).toEqual(result.derivatives);
      expect(commands.lastRegisteredDerivatives).toEqual(result.derivatives);
    },
    30_000,
  );

  it(
    "persists cleanup candidates before writing any derivative",
    async () => {
      const source = await sharp({
        create: {
          width: 48,
          height: 32,
          channels: 4,
          background: { r: 12, g: 24, b: 36, alpha: 1 },
        },
      }).png().toBuffer();
      const storage = new FakeStorage(source);
      const commands = new FakeCoordinator();
      commands.failStage = true;
      const pipeline = new StorageMediaPipeline(storage, commands);
      const intentId = createUploadIntentId({
        actorId: actor.userId,
        scope: intentCommand.scope,
        entityId: intentCommand.entityId,
        expectedVersion: intentCommand.expectedVersion,
        idempotencyKey: intentCommand.idempotencyKey,
      });

      await expect(pipeline.finalizeUpload(actor, {
        ...intentCommand,
        sizeBytes: source.byteLength,
        idempotencyKey: "media-service-finalize-stage-failure-0001",
        intentId,
        sourcePath: createSourceObjectPath({
          scope: intentCommand.scope,
          entityId: intentCommand.entityId,
          intentId,
          contentType: intentCommand.contentType,
        }),
      })).rejects.toMatchObject({
        code: "MEDIA_CLEANUP_CONFLICT",
        httpStatus: 409,
      });
      expect(commands.stageCalls).toBe(1);
      expect(commands.finalizeCalls).toBe(0);
      expect(storage.derivatives).toHaveLength(0);
    },
    30_000,
  );

  it("refuses a source whose actual byte count differs from the intent", async () => {
    const storage = new FakeStorage(Buffer.from("size-does-not-match"));
    const pipeline = new StorageMediaPipeline(
      storage,
      new FakeCoordinator(),
    );
    const intentId = "a".repeat(64);
    await expect(
      pipeline.finalizeUpload(actor, {
        ...intentCommand,
        sizeBytes: 1,
        idempotencyKey: "media-service-finalize-0002",
        intentId,
        sourcePath: createSourceObjectPath({
          scope: intentCommand.scope,
          entityId: intentCommand.entityId,
          intentId,
          contentType: intentCommand.contentType,
        }),
      }),
    ).rejects.toMatchObject({
      code: "SOURCE_IMAGE_SIZE_MISMATCH",
      httpStatus: 409,
    } satisfies Partial<CommerceDomainError>);
    expect(storage.derivatives).toHaveLength(0);
  });

  it("labels local demo responses as unpersisted and rejects key reuse", async () => {
    const pipeline = new DemoMediaPipeline();
    const first = await pipeline.createUploadIntent(actor, {
      ...intentCommand,
      idempotencyKey: "media-service-demo-unique-0001",
    });
    const replay = await pipeline.createUploadIntent(actor, {
      ...intentCommand,
      idempotencyKey: "media-service-demo-unique-0001",
    });
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      mode: "demo",
      persisted: false,
      signedUploadUrl: null,
      signedUploadToken: null,
    });
    expect(first.message).toContain("no object was uploaded");

    const finalizeCommand: FinalizeUploadInput = {
      ...intentCommand,
      idempotencyKey: "media-service-demo-finalize-0001",
      intentId: first.intentId,
      sourcePath: first.sourcePath,
    };
    const finalized = await pipeline.finalizeUpload(actor, finalizeCommand);
    const finalizedReplay = await pipeline.finalizeUpload(
      actor,
      finalizeCommand,
    );
    expect(finalized.replayed).toBe(false);
    expect(finalizedReplay.replayed).toBe(true);
    expect(finalizedReplay.persisted).toBe(false);

    await expect(
      pipeline.createUploadIntent(actor, {
        ...intentCommand,
        fileName: "different.png",
        idempotencyKey: "media-service-demo-unique-0001",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
    } satisfies Partial<CommerceDomainError>);
  });
});
