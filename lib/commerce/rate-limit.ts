import { CommerceDomainError } from "./errors";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
}

export interface RateLimitRepository {
  consume(input: {
    readonly scope: string;
    readonly principalHash: string;
    readonly limit: number;
    readonly windowMs: number;
    readonly now: number;
  }): Promise<RateLimitDecision>;
}

interface WindowRecord {
  readonly startedAt: number;
  readonly count: number;
}

/**
 * Deterministic demo implementation. Production commands must inject a shared,
 * durable repository and never use this process-local limiter.
 */
export class DemoRateLimitRepository implements RateLimitRepository {
  readonly #windows = new Map<string, WindowRecord>();
  readonly #maximumWindows: number;

  constructor(maximumWindows = 64) {
    if (!Number.isSafeInteger(maximumWindows) || maximumWindows < 1) {
      throw new CommerceDomainError(
        "INVALID_DEMO_CAPACITY",
        "Demo rate-limit capacity must be a positive integer.",
      );
    }
    this.#maximumWindows = maximumWindows;
  }

  async consume(input: {
    readonly scope: string;
    readonly principalHash: string;
    readonly limit: number;
    readonly windowMs: number;
    readonly now: number;
  }): Promise<RateLimitDecision> {
    if (
      !input.scope ||
      !input.principalHash ||
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      !Number.isSafeInteger(input.windowMs) ||
      input.windowMs < 1 ||
      !Number.isSafeInteger(input.now) ||
      input.now < 0
    ) {
      throw new CommerceDomainError(
        "INVALID_RATE_LIMIT",
        "Rate-limit inputs are invalid.",
      );
    }
    for (const [windowKey, record] of this.#windows) {
      if (input.now >= record.startedAt + input.windowMs) {
        this.#windows.delete(windowKey);
      }
    }
    const key = `${input.scope}:${input.principalHash}`;
    const existing = this.#windows.get(key);
    if (!existing && this.#windows.size >= this.#maximumWindows) {
      throw new CommerceDomainError(
        "DEMO_CAPACITY_REACHED",
        "The bounded Sandbox rate-limit store is full.",
        503,
      );
    }
    const current =
      !existing || input.now >= existing.startedAt + input.windowMs
        ? { startedAt: input.now, count: 0 }
        : existing;
    const next = Object.freeze({
      startedAt: current.startedAt,
      count: current.count + 1,
    });
    this.#windows.set(key, next);
    return Object.freeze({
      allowed: next.count <= input.limit,
      remaining: Math.max(0, input.limit - next.count),
      resetAt: next.startedAt + input.windowMs,
    });
  }
}
