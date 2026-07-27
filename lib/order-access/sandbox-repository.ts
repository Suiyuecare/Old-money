import { CommerceDomainError } from "@/lib/commerce/errors";
import { DeterministicIdempotencyStore } from "@/lib/commerce/idempotency";
import { DemoRateLimitRepository } from "@/lib/commerce/rate-limit";
import { verifyHmacValue } from "@/lib/security/crypto";

import type {
  AccessExchangeResult,
  AccessLinkRequestResult,
  OrderAccessView,
} from "./contracts";
import type { OrderAccessRepository } from "./repository";

const MAX_CHALLENGES = 128;
const MAX_SESSIONS = 128;
const REQUESTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;

interface Challenge {
  readonly tokenDigest: string;
  readonly publicId: string;
  readonly expiresAt: number;
  consumedAt: number | null;
}

interface Session {
  readonly sessionDigest: string;
  readonly publicId: string;
  readonly expiresAt: number;
  revokedAt: number | null;
}

const freezeView = (view: OrderAccessView): OrderAccessView =>
  Object.freeze({
    ...view,
    trackingIds: Object.freeze([...view.trackingIds]),
  });

export class SandboxOrderAccessRepository
  implements OrderAccessRepository
{
  readonly #orders = new Map<
    string,
    { readonly emailDigest: string; readonly view: OrderAccessView }
  >();
  readonly #challenges = new Map<string, Challenge>();
  readonly #sessions = new Map<string, Session>();
  readonly #commands: DeterministicIdempotencyStore;
  readonly #rateLimit = new DemoRateLimitRepository(128);
  readonly #now: () => number;

  constructor(input: {
    readonly knownOrders: readonly {
      readonly emailDigest: string;
      readonly view: OrderAccessView;
    }[];
    readonly now?: () => number;
  }) {
    this.#now = input.now ?? Date.now;
    this.#commands = new DeterministicIdempotencyStore({
      maximumRecords: 256,
      ttlMs: HOUR_MS,
      now: this.#now,
    });
    for (const order of input.knownOrders) {
      this.#orders.set(order.view.publicId.toUpperCase(), {
        emailDigest: order.emailDigest,
        view: freezeView(order.view),
      });
    }
  }

  async requestAccessLink(input: {
    readonly publicId: string;
    readonly emailDigest: string;
    readonly requestPrincipalHash: string;
    readonly challengeId: string;
    readonly tokenDigest: string;
    readonly expiresAt: string;
    readonly idempotencyKey: string;
  }): Promise<AccessLinkRequestResult> {
    const command = {
      actorScope: `guest:${input.requestPrincipalHash}`,
      commandName: "order-access.request",
      key: input.idempotencyKey,
      request: {
        publicId: input.publicId.toUpperCase(),
        emailDigest: input.emailDigest,
      },
    } as const;
    const replay = this.#commands.inspect<AccessLinkRequestResult>(command);
    if (replay) {
      return Object.freeze({ ...replay.result, replayed: true });
    }
    const now = this.#now();
    const decision = await this.#rateLimit.consume({
      scope: "order-access-request",
      principalHash: input.requestPrincipalHash,
      limit: REQUESTS_PER_HOUR,
      windowMs: HOUR_MS,
      now,
    });
    if (!decision.allowed) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_RATE_LIMITED",
        "Too many order access requests.",
        429,
        {
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((decision.resetAt - now) / 1_000),
          ),
        },
      );
    }
    return this.#commands.execute<AccessLinkRequestResult>(
      command,
      () => {
        const order = this.#orders.get(input.publicId.toUpperCase());
        const matches = Boolean(
          order &&
            verifyHmacValue(
              input.emailDigest,
              order.emailDigest,
            ),
        );
        if (matches && order) {
          this.#deleteExpired(now);
          if (this.#challenges.size >= MAX_CHALLENGES) {
            throw new CommerceDomainError(
              "ORDER_ACCESS_CAPACITY",
              "Sandbox order access challenge capacity is full.",
              503,
            );
          }
          this.#challenges.set(input.tokenDigest, {
            tokenDigest: input.tokenDigest,
            publicId: order.view.publicId,
            expiresAt: Date.parse(input.expiresAt),
            consumedAt: null,
          });
        }
        return Object.freeze({
          challengeId: input.challengeId,
          deliveryQueued: Boolean(matches),
          expiresAt: input.expiresAt,
          replayed: false,
        });
      },
    ).result;
  }

  async exchangeAccessToken(input: {
    readonly tokenDigest: string;
    readonly sessionDigest: string;
    readonly sessionExpiresAt: string;
    readonly now: string;
  }): Promise<AccessExchangeResult> {
    const now = Date.parse(input.now);
    this.#deleteExpired(now);
    const challenge = this.#challenges.get(input.tokenDigest);
    if (
      !challenge ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= now
    ) {
      return Object.freeze({
        granted: false,
        sessionExpiresAt: null,
        order: null,
      });
    }
    if (this.#sessions.size >= MAX_SESSIONS) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_CAPACITY",
        "Sandbox order access session capacity is full.",
        503,
      );
    }
    challenge.consumedAt = now;
    this.#sessions.set(input.sessionDigest, {
      sessionDigest: input.sessionDigest,
      publicId: challenge.publicId,
      expiresAt: Date.parse(input.sessionExpiresAt),
      revokedAt: null,
    });
    const order = this.#orders.get(challenge.publicId.toUpperCase());
    return Object.freeze({
      granted: Boolean(order),
      sessionExpiresAt: input.sessionExpiresAt,
      order: order ? freezeView(order.view) : null,
    });
  }

  async readSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<OrderAccessView | null> {
    const now = Date.parse(input.now);
    this.#deleteExpired(now);
    const session = this.#sessions.get(input.sessionDigest);
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now
    ) {
      return null;
    }
    const order = this.#orders.get(session.publicId.toUpperCase());
    return order ? freezeView(order.view) : null;
  }

  async revokeSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<void> {
    const session = this.#sessions.get(input.sessionDigest);
    if (session) session.revokedAt = Date.parse(input.now);
  }

  #deleteExpired(now: number): void {
    for (const [digest, challenge] of this.#challenges) {
      if (challenge.expiresAt <= now) this.#challenges.delete(digest);
    }
    for (const [digest, session] of this.#sessions) {
      if (session.expiresAt <= now) this.#sessions.delete(digest);
    }
  }
}
