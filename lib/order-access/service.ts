import {
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { isIP } from "node:net";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { hmacLookup } from "@/lib/security/crypto";

import {
  ORDER_ACCESS_COOKIE,
  ORDER_ACCESS_LINK_TTL_MS,
  ORDER_ACCESS_SESSION_TTL_MS,
  type OrderAccessRequest,
  type OrderAccessView,
} from "./contracts";
import type { OrderAccessRepository } from "./repository";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export interface OrderAccessSecrets {
  readonly tokenKey: Buffer;
  readonly lookupKey: Buffer;
}

export interface SandboxAccessDelivery {
  readonly challengeId: string;
  readonly publicId: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface OrderAccessServiceOptions {
  readonly now?: () => number;
  readonly createChallengeId?: () => string;
  readonly createSessionToken?: () => string;
  readonly observeSandboxDelivery?: (
    delivery: SandboxAccessDelivery,
  ) => void;
}

const assertKey = (key: Buffer, name: string): void => {
  if (key.length !== 32) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_SECRET_INVALID",
      `${name} must decode to exactly 32 bytes.`,
      503,
    );
  }
};

export function decodeOrderAccessSecret(
  value: string | undefined,
  name: string,
): Buffer {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_BINDING_UNAVAILABLE",
      `${name} is unavailable or invalid.`,
      503,
    );
  }
  const key = Buffer.from(value, "base64url");
  assertKey(key, name);
  if (key.toString("base64url") !== value) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_BINDING_UNAVAILABLE",
      `${name} is not canonical base64url.`,
      503,
    );
  }
  return key;
}

export const normalizeOrderAccessEmail = (email: string): string =>
  email.normalize("NFKC").trim().toLowerCase();

export const deriveOrderEmailDigest = (
  email: string,
  lookupKey: Buffer,
): string =>
  hmacLookup(
    "lignee/order-access/email/v1",
    normalizeOrderAccessEmail(email),
    lookupKey,
  );

export const deriveOrderAccessChallengeToken = (
  challengeId: string,
  tokenKey: Buffer,
): string =>
  createHmac("sha256", tokenKey)
    .update(`lignee/order-access/challenge-token/v1\u0000${challengeId}`)
    .digest("base64url");

const deriveTokenDigest = (
  token: string,
  tokenKey: Buffer,
): string =>
  hmacLookup("lignee/order-access/token-digest/v1", token, tokenKey);

const derivePrincipalHash = (
  principal: string,
  lookupKey: Buffer,
): string =>
  hmacLookup(
    "lignee/order-access/request-principal/v1",
    principal.trim().toLowerCase() || "unknown",
    lookupKey,
  );

const sessionCookie = (value: string, maxAgeSeconds: number): string =>
  [
    `${ORDER_ACCESS_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");

export const clearOrderAccessCookie = (): string =>
  sessionCookie("", 0);

export const readOrderAccessCookie = (
  cookieHeader: string | null,
): string | null => {
  if (!cookieHeader) return null;
  const matches = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${ORDER_ACCESS_COOKIE}=`))
    .map((part) => part.slice(ORDER_ACCESS_COOKIE.length + 1));
  if (matches.length !== 1 || !TOKEN_PATTERN.test(matches[0] ?? "")) {
    return null;
  }
  return matches[0] ?? null;
};

export const requestPrincipalFrom = (request: Request): string => {
  const normalizeIp = (value: string | null): string | null => {
    const candidate = value?.trim() ?? "";
    return isIP(candidate) > 0 ? candidate.toLowerCase() : null;
  };

  if (process.env.VERCEL === "1") {
    return (
      normalizeIp(request.headers.get("x-vercel-forwarded-for")) ??
      normalizeIp(request.headers.get("x-forwarded-for")) ??
      "unknown"
    );
  }
  if (process.env.NODE_ENV !== "production") {
    const localForwarded =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
    return (
      normalizeIp(localForwarded) ??
      normalizeIp(request.headers.get("x-real-ip")) ??
      "unknown"
    );
  }
  return "unknown";
};

export class OrderAccessService {
  readonly #now: () => number;
  readonly #createChallengeId: () => string;
  readonly #createSessionToken: () => string;
  readonly #observeSandboxDelivery:
    | ((delivery: SandboxAccessDelivery) => void)
    | undefined;

  constructor(
    private readonly repository: OrderAccessRepository,
    private readonly secrets: OrderAccessSecrets,
    options: OrderAccessServiceOptions = {},
  ) {
    assertKey(secrets.tokenKey, "ORDER_ACCESS_TOKEN_SECRET");
    assertKey(secrets.lookupKey, "ORDER_ACCESS_LOOKUP_SECRET");
    this.#now = options.now ?? Date.now;
    this.#createChallengeId =
      options.createChallengeId ?? randomUUID;
    this.#createSessionToken =
      options.createSessionToken ??
      (() => randomBytes(32).toString("base64url"));
    this.#observeSandboxDelivery =
      options.observeSandboxDelivery;
  }

  async requestLink(
    request: OrderAccessRequest,
    requestPrincipal: string,
  ): Promise<{ readonly accepted: true }> {
    const now = this.#now();
    const challengeId = this.#createChallengeId();
    const proposedToken = deriveOrderAccessChallengeToken(
      challengeId,
      this.secrets.tokenKey,
    );
    const result = await this.repository.requestAccessLink({
      publicId: request.publicId.trim().toUpperCase(),
      emailDigest: deriveOrderEmailDigest(
        request.email,
        this.secrets.lookupKey,
      ),
      requestPrincipalHash: derivePrincipalHash(
        requestPrincipal,
        this.secrets.lookupKey,
      ),
      challengeId,
      tokenDigest: deriveTokenDigest(
        proposedToken,
        this.secrets.tokenKey,
      ),
      expiresAt: new Date(
        now + ORDER_ACCESS_LINK_TTL_MS,
      ).toISOString(),
      idempotencyKey: request.idempotencyKey,
    });

    // Production delivery is an atomic database outbox side effect of the
    // request RPC. This observer exists only in the bounded Sandbox so tests
    // can emulate reading the email without returning a token from the API.
    if (result.deliveryQueued && this.#observeSandboxDelivery) {
      this.#observeSandboxDelivery(
        Object.freeze({
          challengeId: result.challengeId,
          publicId: request.publicId.trim().toUpperCase(),
          token: deriveOrderAccessChallengeToken(
            result.challengeId,
            this.secrets.tokenKey,
          ),
          expiresAt: result.expiresAt,
        }),
      );
    }

    // Always use the same public envelope for matching and non-matching
    // order/email pairs.
    return Object.freeze({ accepted: true });
  }

  async exchangeToken(token: string): Promise<{
    readonly cookie: string;
    readonly order: OrderAccessView;
  }> {
    if (!TOKEN_PATTERN.test(token)) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_DENIED",
        "The order access link is invalid or expired.",
        401,
      );
    }
    const now = this.#now();
    const rawSession = this.#createSessionToken();
    if (!TOKEN_PATTERN.test(rawSession)) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_SESSION_FAILURE",
        "A secure order access session could not be created.",
        503,
      );
    }
    const result = await this.repository.exchangeAccessToken({
      tokenDigest: deriveTokenDigest(token, this.secrets.tokenKey),
      sessionDigest: deriveTokenDigest(
        rawSession,
        this.secrets.tokenKey,
      ),
      sessionExpiresAt: new Date(
        now + ORDER_ACCESS_SESSION_TTL_MS,
      ).toISOString(),
      now: new Date(now).toISOString(),
    });
    const requestedSessionExpiry =
      now + ORDER_ACCESS_SESSION_TTL_MS;
    const returnedSessionExpiry = result.sessionExpiresAt
      ? Date.parse(result.sessionExpiresAt)
      : Number.NaN;
    if (!result.granted || !result.order || !result.sessionExpiresAt) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_DENIED",
        "The order access link is invalid or expired.",
        401,
      );
    }
    if (
      !Number.isFinite(returnedSessionExpiry) ||
      returnedSessionExpiry > requestedSessionExpiry
    ) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_INVALID_RESPONSE",
        "The durable order access service returned an invalid session.",
        503,
      );
    }
    const maxAge = Math.max(
      0,
      Math.floor(
        (returnedSessionExpiry - now) / 1_000,
      ),
    );
    if (maxAge < 1) {
      throw new CommerceDomainError(
        "ORDER_ACCESS_DENIED",
        "The order access link is invalid or expired.",
        401,
      );
    }
    return Object.freeze({
      cookie: sessionCookie(rawSession, maxAge),
      order: result.order,
    });
  }

  async readSession(rawSession: string): Promise<OrderAccessView | null> {
    if (!TOKEN_PATTERN.test(rawSession)) return null;
    return this.repository.readSession({
      sessionDigest: deriveTokenDigest(
        rawSession,
        this.secrets.tokenKey,
      ),
      now: new Date(this.#now()).toISOString(),
    });
  }

  async revokeSession(rawSession: string): Promise<void> {
    if (!TOKEN_PATTERN.test(rawSession)) return;
    await this.repository.revokeSession({
      sessionDigest: deriveTokenDigest(
        rawSession,
        this.secrets.tokenKey,
      ),
      now: new Date(this.#now()).toISOString(),
    });
  }
}
