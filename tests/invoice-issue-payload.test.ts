import { describe, expect, it } from "vitest";

import {
  createEncryptedInvoiceIssuePayloadResolver,
  decodeInvoicePiiEncryptionKey,
} from "@/lib/operations/invoice-payload";
import { encryptEnvelope } from "@/lib/security/crypto";

const orderId = "72000000-0000-4000-8000-000000000001";
const invoiceId = "72000000-0000-4000-8000-000000000002";
const operationKey =
  "operations:invoice-pii-test-0001:invoice.issue";

describe("invoice issue PII resolution", () => {
  it("keeps the durable payload opaque and decrypts only in memory", async () => {
    const encryptionKey = Buffer.alloc(32, 11);
    const invoiceOption = {
      kind: "ecpay_email",
      email: "buyer@example.com",
    } as const;
    const invoiceEnvelope = encryptEnvelope(
      JSON.stringify(invoiceOption),
      {
        schema: "commerce_private",
        table: "order_pii",
        rowId: orderId,
        column: "invoice_envelope",
        schemaVersion: 1,
      },
      encryptionKey,
      1,
    );
    const references: unknown[] = [];
    const resolver = createEncryptedInvoiceIssuePayloadResolver({
      encryptionKey,
      resolveEnvelope: async (reference) => {
        references.push(reference);
        return {
          orderId,
          invoiceEnvelope,
          schemaVersion: 1,
          keyVersion: 1,
        };
      },
    });
    const payload = {
      invoiceId,
      totals: {
        grossTwd: 9_800,
        netTwd: 9_333,
        taxTwd: 467,
      },
    };

    expect(JSON.stringify(payload)).not.toContain(
      "buyer@example.com",
    );
    await expect(
      resolver({
        aggregateId: orderId,
        operationKey,
        payload,
      }),
    ).resolves.toMatchObject({
      CarrierType: "1",
      CarrierNum: "buyer@example.com",
      Print: "0",
    });
    expect(references).toEqual([
      { aggregateId: orderId, invoiceId, operationKey },
    ]);
    expect(JSON.stringify(payload)).not.toContain(
      "buyer@example.com",
    );
  });

  it("rejects a durable payload that attempts to embed an option", async () => {
    const resolver = createEncryptedInvoiceIssuePayloadResolver({
      encryptionKey: Buffer.alloc(32, 12),
      resolveEnvelope: async () => null,
    });

    await expect(
      resolver({
        aggregateId: orderId,
        operationKey,
        payload: {
          invoiceId,
          totals: {
            grossTwd: 9_800,
            netTwd: 9_333,
            taxTwd: 467,
          },
          option: {
            kind: "ecpay_email",
            email: "buyer@example.com",
          },
        },
      }),
    ).rejects.toThrow(
      "INVALID_JOB_PAYLOAD:invoice_issue_reference",
    );
  });

  it("accepts only a canonical 32-byte invoice PII key", () => {
    const canonical = Buffer.alloc(32, 13).toString("base64url");
    expect(decodeInvoicePiiEncryptionKey(canonical)).toEqual(
      Buffer.alloc(32, 13),
    );
    expect(() =>
      decodeInvoicePiiEncryptionKey("not-a-key"),
    ).toThrow(/unavailable or invalid/i);
  });
});
