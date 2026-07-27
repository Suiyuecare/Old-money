import type {
  AccessExchangeResult,
  AccessLinkRequestResult,
  OrderAccessView,
} from "./contracts";

export interface OrderAccessRepository {
  requestAccessLink(input: {
    readonly publicId: string;
    readonly emailDigest: string;
    readonly requestPrincipalHash: string;
    readonly challengeId: string;
    readonly tokenDigest: string;
    readonly expiresAt: string;
    readonly idempotencyKey: string;
  }): Promise<AccessLinkRequestResult>;
  exchangeAccessToken(input: {
    readonly tokenDigest: string;
    readonly sessionDigest: string;
    readonly sessionExpiresAt: string;
    readonly now: string;
  }): Promise<AccessExchangeResult>;
  readSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<OrderAccessView | null>;
  revokeSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<void>;
}
