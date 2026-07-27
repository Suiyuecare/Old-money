import { getAdminAuthClient } from "@/lib/admin/auth";
import { getCommerceEnvironment } from "@/lib/commerce/config";
import { getCommerceContainer } from "@/lib/commerce/container";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";
import { getOrderAccessEmailPayloadResolver } from "@/lib/order-access/container";

import {
  createEncryptedInvoiceIssuePayloadResolver,
  decodeInvoicePiiEncryptionKey,
  type InvoiceIssuePayloadResolver,
} from "./invoice-payload";
import type { OperationsWorkflowRepository } from "./repository";
import { SandboxOperationsRepository } from "./sandbox-repository";
import { SupabaseOperationsRepository } from "./supabase-repository";
import type { OperationWorkerProviders } from "./worker";

interface OperationsGlobal {
  [sandboxRepositoryKey]?: SandboxOperationsRepository;
}

const sandboxRepositoryKey = Symbol.for(
  "lignee.sandbox-operations-repository.v1",
);

function isLocalSandbox(): boolean {
  const verifiedVercelPreview =
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "preview";
  return (
    getCommerceEnvironment().mode === "demo" &&
    (process.env.NODE_ENV !== "production" || verifiedVercelPreview)
  );
}

export function getSandboxOperationsRepository(): SandboxOperationsRepository {
  const globalObject = globalThis as OperationsGlobal;
  globalObject[sandboxRepositoryKey] ??=
    new SandboxOperationsRepository();
  return globalObject[sandboxRepositoryKey];
}

export async function getRequestOperationsRepository(): Promise<OperationsWorkflowRepository> {
  if (isLocalSandbox()) return getSandboxOperationsRepository();
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new CommerceDomainError(
      "OPERATIONS_REPOSITORY_UNAVAILABLE",
      "The authenticated operations repository is unavailable.",
      503,
    );
  }
  return new SupabaseOperationsRepository(await getAdminAuthClient());
}

export function getWorkerOperationsRepository(): OperationsWorkflowRepository {
  if (isLocalSandbox()) return getSandboxOperationsRepository();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new CommerceDomainError(
      "OPERATIONS_WORKER_REPOSITORY_UNAVAILABLE",
      "The durable worker repository is unavailable.",
      503,
    );
  }
  return new SupabaseOperationsRepository(
    getPrivilegedSupabaseClient(),
  );
}

export function getOperationWorkerProviders(): OperationWorkerProviders {
  if (isLocalSandbox()) {
    const container = getCommerceContainer();
    const repository = getSandboxOperationsRepository();
    return Object.freeze({
      payment: container.payment,
      invoice: container.invoice,
      logistics: container.logistics,
      email: container.email,
      invoiceIssuePayloadResolver:
        repository.resolveInvoiceIssueOption,
      orderAccessEmailPayloadResolver:
        getOrderAccessEmailPayloadResolver(),
    });
  }
  // Production adapters need validated merchant, invoice, logistics, and
  // Resend credentials plus canary evidence. Never substitute Sandbox mocks.
  throw new CommerceDomainError(
    "OPERATIONS_PROVIDERS_UNAVAILABLE",
    "Live operations providers are not provisioned; remote effects remain disabled.",
    503,
  );
}

export function getInvoiceIssuePayloadResolver(): InvoiceIssuePayloadResolver {
  if (isLocalSandbox()) {
    return getSandboxOperationsRepository()
      .resolveInvoiceIssueOption;
  }
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    throw new CommerceDomainError(
      "INVOICE_PII_REPOSITORY_UNAVAILABLE",
      "The encrypted invoice option resolver is unavailable.",
      503,
    );
  }
  const client = getPrivilegedSupabaseClient();
  return createEncryptedInvoiceIssuePayloadResolver({
    encryptionKey: decodeInvoicePiiEncryptionKey(
      process.env.ORDER_PII_ENCRYPTION_KEY_V1,
    ),
    resolveEnvelope: async (reference) => {
      const { data, error } = await client
        .schema("api")
        .rpc("worker_invoice_issue_payload_resolve", {
          p_invoice_id: reference.invoiceId,
          p_aggregate_id: reference.aggregateId,
          p_operation_key: reference.operationKey,
        });
      if (error) {
        throw new CommerceDomainError(
          "INVOICE_PII_REPOSITORY_UNAVAILABLE",
          "The encrypted invoice option resolver is unavailable.",
          503,
        );
      }
      return data;
    },
  });
}

export function resetSandboxOperationsForTests(input?: {
  readonly now?: () => number;
}): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Sandbox operations may only be reset by tests.");
  }
  const globalObject = globalThis as OperationsGlobal;
  globalObject[sandboxRepositoryKey] =
    new SandboxOperationsRepository(input);
}
