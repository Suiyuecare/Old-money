import { createHash } from "node:crypto";

import { CommerceDomainError, IdempotencyConflictError } from "./errors";

export interface IdempotencyRecord<Result> {
  readonly actorScope: string;
  readonly commandName: string;
  readonly key: string;
  readonly requestHash: string;
  readonly result: Result;
  readonly expiresAt: number;
}

export interface IdempotencyCommandInput {
  readonly actorScope: string;
  readonly commandName: string;
  readonly key: string;
  readonly request: unknown;
}

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const hashIdempotencyRequest = (request: unknown): string =>
  createHash("sha256").update(canonicalJson(request)).digest("hex");

export class DeterministicIdempotencyStore {
  readonly #records = new Map<string, IdempotencyRecord<unknown>>();
  readonly #maximumRecords: number;
  readonly #ttlMs: number;
  readonly #now: () => number;

  constructor(
    options:
      | number
      | {
          readonly maximumRecords?: number;
          readonly ttlMs?: number;
          readonly now?: () => number;
        } = {},
  ) {
    const maximumRecords =
      typeof options === "number" ? options : (options.maximumRecords ?? 128);
    const ttlMs =
      typeof options === "number" ? 15 * 60_000 : (options.ttlMs ?? 15 * 60_000);
    if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1) {
      throw new CommerceDomainError(
        "INVALID_DEMO_CAPACITY",
        "Demo idempotency capacity must be a positive integer.",
      );
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
      throw new CommerceDomainError(
        "INVALID_DEMO_TTL",
        "Demo idempotency TTL must be a positive integer.",
      );
    }
    this.#maximumRecords = maximumRecords;
    this.#ttlMs = ttlMs;
    this.#now = typeof options === "number" ? Date.now : (options.now ?? Date.now);
  }

  get recordCount(): number {
    this.#deleteExpired(this.#now());
    return this.#records.size;
  }

  inspect<Result>(
    input: IdempotencyCommandInput,
  ): { readonly result: Result; readonly replayed: true } | undefined {
    const now = this.#now();
    this.#deleteExpired(now);
    const storageKey = this.#storageKey(input);
    const requestHash = hashIdempotencyRequest(input.request);
    const existing = this.#records.get(storageKey);
    if (!existing) return undefined;
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
    return { result: existing.result as Result, replayed: true };
  }

  execute<Result>(
    input: IdempotencyCommandInput,
    command: () => Result,
  ): { readonly result: Result; readonly replayed: boolean } {
    const now = this.#now();
    this.#deleteExpired(now);
    const storageKey = this.#storageKey(input);
    const requestHash = hashIdempotencyRequest(input.request);
    const existing = this.#records.get(storageKey);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
      return { result: existing.result as Result, replayed: true };
    }
    if (this.#records.size >= this.#maximumRecords) {
      throw new CommerceDomainError(
        "DEMO_CAPACITY_REACHED",
        "The bounded Sandbox command store is full; no idempotency key was evicted.",
        503,
      );
    }
    const result = command();
    this.#records.set(
      storageKey,
      Object.freeze({
        actorScope: input.actorScope,
        commandName: input.commandName,
        key: input.key,
        requestHash,
        result,
        expiresAt: now + this.#ttlMs,
      }),
    );
    return { result, replayed: false };
  }

  #storageKey(input: IdempotencyCommandInput): string {
    return `${input.actorScope}:${input.commandName}:${input.key}`;
  }

  #deleteExpired(now: number): void {
    for (const [key, record] of this.#records) {
      if (now >= record.expiresAt) this.#records.delete(key);
    }
  }
}
