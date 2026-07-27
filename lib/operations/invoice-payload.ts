import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  invoiceOptionSchema,
  toEcpayInvoiceFields,
} from "@/lib/providers/invoice-schema";
import { decryptEnvelope } from "@/lib/security/crypto";

const encryptedEnvelopeSchema = z.strictObject({
  algorithm: z.literal("aes-256-gcm"),
  keyVersion: z.number().int().positive(),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
  authTag: z.string().min(1),
});

export const invoiceIssueJobPayloadSchema = z.strictObject({
  invoiceId: z.string().uuid(),
  totals: z.record(z.string(), z.unknown()),
});

const invoiceEnvelopeResolutionSchema = z.strictObject({
  orderId: z.string().uuid(),
  invoiceEnvelope: encryptedEnvelopeSchema,
  schemaVersion: z.number().int().positive(),
  keyVersion: z.number().int().positive(),
});

export interface InvoiceIssuePayloadResolutionRequest {
  readonly aggregateId: string;
  readonly operationKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type InvoiceIssuePayloadResolver = (
  request: InvoiceIssuePayloadResolutionRequest,
) => Promise<Readonly<Record<string, string>>>;

export interface InvoiceEnvelopeReference {
  readonly invoiceId: string;
  readonly aggregateId: string;
  readonly operationKey: string;
}

export type EncryptedInvoiceEnvelopeResolver = (
  reference: InvoiceEnvelopeReference,
) => Promise<unknown>;

function invalidInvoicePayload(field: string): Error {
  return new Error(`INVALID_JOB_PAYLOAD:${field}`);
}

export function decodeInvoicePiiEncryptionKey(
  value: string | undefined,
): Buffer {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new CommerceDomainError(
      "INVOICE_PII_BINDING_UNAVAILABLE",
      "ORDER_PII_ENCRYPTION_KEY_V1 is unavailable or invalid.",
      503,
    );
  }
  const key = Buffer.from(value, "base64url");
  if (
    key.length !== 32 ||
    key.toString("base64url") !== value
  ) {
    throw new CommerceDomainError(
      "INVOICE_PII_BINDING_UNAVAILABLE",
      "ORDER_PII_ENCRYPTION_KEY_V1 must be canonical base64url.",
      503,
    );
  }
  return key;
}

/**
 * Resolves the encrypted invoice option only after a durable job is leased.
 * Plaintext is returned to the provider call in memory and is never written
 * back to the command receipt, operation job, evidence, or result records.
 */
export function createEncryptedInvoiceIssuePayloadResolver(input: {
  readonly encryptionKey: Buffer;
  readonly resolveEnvelope: EncryptedInvoiceEnvelopeResolver;
}): InvoiceIssuePayloadResolver {
  if (input.encryptionKey.length !== 32) {
    throw new CommerceDomainError(
      "INVOICE_PII_BINDING_UNAVAILABLE",
      "The invoice PII key must contain exactly 32 bytes.",
      503,
    );
  }
  return async (request) => {
    const durable = invoiceIssueJobPayloadSchema.safeParse(
      request.payload,
    );
    if (!durable.success) {
      throw invalidInvoicePayload("invoice_issue_reference");
    }
    const rawEnvelope = await input.resolveEnvelope({
      invoiceId: durable.data.invoiceId,
      aggregateId: request.aggregateId,
      operationKey: request.operationKey,
    });
    const resolved = invoiceEnvelopeResolutionSchema.safeParse(
      Array.isArray(rawEnvelope) && rawEnvelope.length === 1
        ? rawEnvelope[0]
        : rawEnvelope,
    );
    if (!resolved.success) {
      throw invalidInvoicePayload("invoice_issue_envelope");
    }
    if (
      resolved.data.keyVersion !== 1 ||
      resolved.data.invoiceEnvelope.keyVersion !==
        resolved.data.keyVersion
    ) {
      throw new CommerceDomainError(
        "INVOICE_PII_KEY_UNAVAILABLE",
        "The encrypted invoice option uses an unavailable key version.",
        503,
      );
    }
    const plaintext = decryptEnvelope(
      resolved.data.invoiceEnvelope,
      {
        schema: "commerce_private",
        table: "order_pii",
        rowId: resolved.data.orderId,
        column: "invoice_envelope",
        schemaVersion: resolved.data.schemaVersion,
      },
      input.encryptionKey,
    );
    let parsedPlaintext: unknown;
    try {
      parsedPlaintext = JSON.parse(plaintext) as unknown;
    } catch {
      throw invalidInvoicePayload("invoice_issue_option");
    }
    const option = invoiceOptionSchema.safeParse(parsedPlaintext);
    if (!option.success) {
      throw invalidInvoicePayload("invoice_issue_option");
    }
    return toEcpayInvoiceFields(option.data);
  };
}
