import type { OrderTotalsSnapshot } from "@/lib/commerce/money";

export interface PaymentRedirectForm {
  readonly endpoint: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface PaymentQueryResult {
  readonly tradeStatus: "paid" | "unpaid" | "unknown";
  readonly providerTradeNo?: string;
  readonly amountTwd?: number;
  readonly evidenceHash: string;
}

export interface PaymentGateway {
  createRedirectForm(input: {
    readonly merchantTradeNo: string;
    readonly totals: OrderTotalsSnapshot;
    readonly description: string;
    readonly applePayEnabled: boolean;
    readonly returnUrl: string;
    readonly callbackUrl: string;
  }): Promise<PaymentRedirectForm>;
  queryTrade(input: {
    readonly merchantTradeNo: string;
  }): Promise<PaymentQueryResult>;
  refund(input: {
    readonly operationKey: string;
    readonly providerTradeNo: string;
    readonly amountTwd: number;
  }): Promise<{ readonly state: "succeeded" | "unknown" | "failed_terminal" }>;
}

export interface InvoiceProvider {
  issue(input: {
    readonly operationKey: string;
    readonly orderId: string;
    readonly totals: OrderTotalsSnapshot;
    readonly option: Readonly<Record<string, string>>;
  }): Promise<{ readonly state: "issued" | "unknown" | "failed_terminal"; readonly relateNumber?: string }>;
  adjust(input: {
    readonly operationKey: string;
    readonly relateNumber: string;
    readonly amountTwd: number;
    readonly kind: "void" | "allowance";
  }): Promise<{ readonly state: "succeeded" | "unknown" | "failed_terminal" }>;
}

export interface LogisticsProvider {
  createShipment(input: {
    readonly operationKey: string;
    readonly orderId: string;
    readonly parcelCount: number;
  }): Promise<{ readonly state: "created" | "unknown" | "failed_terminal"; readonly trackingIds: readonly string[] }>;
  cancelShipment(input: {
    readonly operationKey: string;
    readonly trackingId: string;
  }): Promise<{ readonly state: "cancelled" | "unknown" | "picked_up" }>;
}

export interface EmailProvider {
  send(input: {
    readonly operationKey: string;
    readonly templateVersion: string;
    readonly to: string;
    readonly subject: string;
    readonly text: string;
  }): Promise<{ readonly state: "queued" | "unknown" | "failed_terminal"; readonly messageId?: string }>;
}

