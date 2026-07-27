import { describe, expect, it, vi } from "vitest";

import {
  createOrderAccessEmailPayloadResolver,
  ORDER_ACCESS_EMAIL_TEMPLATE_VERSION,
  orderAccessEmailJobPayloadSchema,
} from "@/lib/order-access/email-payload";
import { deriveOrderAccessChallengeToken } from "@/lib/order-access/service";
import type { OperationJob } from "@/lib/operations/contracts";
import type { OperationsWorkflowRepository } from "@/lib/operations/repository";
import { OperationsWorker } from "@/lib/operations/worker";
import type { EmailProvider } from "@/lib/providers/interfaces";
import {
  MockInvoiceProvider,
  MockLogisticsProvider,
  MockPaymentGateway,
} from "@/lib/providers/mock";

const challengeId = "10000000-0000-4000-8000-000000000001";
const recipientRef = "20000000-0000-4000-8000-000000000001";
const tokenKey = Buffer.from("31".repeat(32), "hex");

describe("order access email payload resolution", () => {
  it("derives the fragment token only in worker memory", async () => {
    const storedPayload = orderAccessEmailJobPayloadSchema.parse({
      kind: "order_access_link",
      templateVersion: ORDER_ACCESS_EMAIL_TEMPLATE_VERSION,
      challengeId,
      recipientRef,
    });
    const token = deriveOrderAccessChallengeToken(
      challengeId,
      tokenKey,
    );
    const persisted = JSON.stringify(storedPayload);
    expect(persisted).not.toContain(token);
    expect(persisted).not.toContain("buyer@example.com");
    expect(persisted).not.toContain("https://");
    expect(persisted).not.toContain("\"text\"");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: Parameters<EmailProvider["send"]>[0][] = [];
    const lifecycle: string[] = [];
    const email: EmailProvider = {
      send: async (input) => {
        lifecycle.push("provider");
        sent.push(input);
        return { state: "queued" };
      },
    };
    const job: OperationJob = Object.freeze({
      id: "email-job-000001",
      operationKey: "order-access-email:challenge-000001",
      aggregateId: "order-000001",
      type: "email.send",
      safety: "remote_effect",
      state: "leased",
      payload: Object.freeze({ ...storedPayload }),
      attemptCount: 1,
      availableAt: "2026-07-28T02:00:00.000Z",
      leaseToken: "worker:lease-000001",
      leaseExpiresAt: "2026-07-28T02:00:30.000Z",
      dispatchStartedAt: null,
      lastEvidenceHash: null,
      lastErrorCode: null,
      createdAt: "2026-07-28T02:00:00.000Z",
      updatedAt: "2026-07-28T02:00:00.000Z",
    });
    const repositoryMethods = {
      claimNextJob: async () => job,
      markDispatchStarted: async () => {
        lifecycle.push("dispatch-fence");
        return Object.freeze({
          ...job,
          dispatchStartedAt: "2026-07-28T02:00:01.000Z",
        });
      },
      completeJob: async () =>
        Object.freeze({
          ...job,
          state: "completed" as const,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
    } satisfies Pick<
      OperationsWorkflowRepository,
      "claimNextJob" | "markDispatchStarted" | "completeJob"
    >;
    const resolvePayload = createOrderAccessEmailPayloadResolver({
      tokenKey,
      resolveRecipient: async (reference) =>
        reference === recipientRef ? "buyer@example.com" : null,
    });
    const resolver: typeof resolvePayload = async (input) => {
      const payload = await resolvePayload(input);
      lifecycle.push("resolve-pii");
      return payload;
    };
    const worker = new OperationsWorker(
      repositoryMethods as unknown as OperationsWorkflowRepository,
      {
        payment: new MockPaymentGateway(),
        invoice: new MockInvoiceProvider(),
        logistics: new MockLogisticsProvider(),
        email,
        invoiceIssuePayloadResolver: async () => {
          throw new Error(
            "INVALID_JOB_PAYLOAD:unexpected_invoice_job",
          );
        },
        orderAccessEmailPayloadResolver: resolver,
      },
    );

    const result = await worker.runOne({
      workerId: "email-worker",
      now: Date.parse("2026-07-28T02:00:01.000Z"),
    });
    expect(result.job?.state).toBe("completed");
    expect(sent).toHaveLength(1);
    expect(lifecycle).toEqual([
      "resolve-pii",
      "dispatch-fence",
      "provider",
    ]);
    expect(sent[0]).toMatchObject({
      templateVersion: ORDER_ACCESS_EMAIL_TEMPLATE_VERSION,
      to: "buyer@example.com",
    });
    const link = sent[0]?.text.match(/https:\/\/[^\s]+/)?.[0];
    expect(link).toBeTruthy();
    const url = new URL(link ?? "https://invalid.example");
    expect(url.origin).toBe("https://estatelignee.com");
    expect(url.pathname).toBe("/orders/access");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${token}`);
    expect(JSON.stringify(job.payload)).toBe(persisted);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects payloads that attempt to persist a token or rendered text", async () => {
    const resolver = createOrderAccessEmailPayloadResolver({
      tokenKey,
      resolveRecipient: async () => "buyer@example.com",
    });
    await expect(
      resolver({
        kind: "order_access_link",
        templateVersion: ORDER_ACCESS_EMAIL_TEMPLATE_VERSION,
        challengeId,
        recipientRef,
        token: "must-not-be-persisted",
        text: "must-not-be-persisted",
      }),
    ).rejects.toThrow("INVALID_JOB_PAYLOAD:order_access_email");
  });
});
