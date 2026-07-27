import { getCommerceEnvironment } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { decryptEnvelope } from "@/lib/security/crypto";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";
import { z } from "zod";

import type { OrderAccessView } from "./contracts";
import {
  createOrderAccessEmailPayloadResolver,
  type OrderAccessEmailPayloadResolver,
} from "./email-payload";
import { SandboxOrderAccessRepository } from "./sandbox-repository";
import {
  decodeOrderAccessSecret,
  deriveOrderEmailDigest,
  OrderAccessService,
  type SandboxAccessDelivery,
} from "./service";
import { SupabaseOrderAccessRepository } from "./supabase-repository";

const sandboxTokenKey = Buffer.from("e1".repeat(32), "hex");
const sandboxLookupKey = Buffer.from("b2".repeat(32), "hex");
const sandboxBundleKey = Symbol.for(
  "lignee.sandbox-order-access-bundle.v1",
);
export const SANDBOX_ORDER_ACCESS_RECIPIENT_REF =
  "00000000-0000-4000-8000-000000000001";

interface SandboxBundle {
  readonly repository: SandboxOrderAccessRepository;
  readonly service: OrderAccessService;
  readonly deliveries: Map<string, SandboxAccessDelivery>;
}

interface OrderAccessGlobal {
  [sandboxBundleKey]?: SandboxBundle;
}

function isLocalSandbox(): boolean {
  const verifiedVercelPreview =
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "preview";
  return (
    getCommerceEnvironment().mode === "demo" &&
    (process.env.NODE_ENV !== "production" || verifiedVercelPreview)
  );
}

const defaultSandboxOrder: OrderAccessView = Object.freeze({
  publicId: "LIG-20260727-1001",
  status: "processing",
  paymentStatus: "paid",
  shipmentStatus: "label_pending",
  grossTwd: 9_800,
  trackingIds: Object.freeze([]),
  updatedAt: "2026-07-28T01:00:00.000Z",
});

const recipientEnvelopeSchema = z.object({
  orderId: z.string().uuid(),
  contactEnvelope: z.object({
    algorithm: z.literal("aes-256-gcm"),
    keyVersion: z.number().int().positive(),
    nonce: z.string().min(1),
    ciphertext: z.string().min(1),
    authTag: z.string().min(1),
  }),
  schemaVersion: z.number().int().positive(),
  keyVersion: z.number().int().positive(),
});

function createSandboxBundle(input: {
  readonly now?: () => number;
} = {}): SandboxBundle {
  const deliveries = new Map<string, SandboxAccessDelivery>();
  const repository = new SandboxOrderAccessRepository({
    knownOrders: [
      {
        emailDigest: deriveOrderEmailDigest(
          "buyer@example.com",
          sandboxLookupKey,
        ),
        view: defaultSandboxOrder,
      },
    ],
    now: input.now,
  });
  const service = new OrderAccessService(
    repository,
    {
      tokenKey: sandboxTokenKey,
      lookupKey: sandboxLookupKey,
    },
    {
      now: input.now,
      observeSandboxDelivery: (delivery) => {
        deliveries.set(delivery.publicId.toUpperCase(), delivery);
      },
    },
  );
  return Object.freeze({ repository, service, deliveries });
}

function getSandboxBundle(): SandboxBundle {
  const globalObject = globalThis as OrderAccessGlobal;
  globalObject[sandboxBundleKey] ??= createSandboxBundle();
  return globalObject[sandboxBundleKey];
}

export function getOrderAccessService(): OrderAccessService {
  if (isLocalSandbox()) return getSandboxBundle().service;
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_REPOSITORY_UNAVAILABLE",
      "The durable order access repository is unavailable.",
      503,
    );
  }
  return new OrderAccessService(
    new SupabaseOrderAccessRepository(
      getPrivilegedSupabaseClient(),
    ),
    {
      tokenKey: decodeOrderAccessSecret(
        process.env.ORDER_ACCESS_TOKEN_SECRET,
        "ORDER_ACCESS_TOKEN_SECRET",
      ),
      lookupKey: decodeOrderAccessSecret(
        process.env.ORDER_ACCESS_LOOKUP_SECRET,
        "ORDER_ACCESS_LOOKUP_SECRET",
      ),
    },
  );
}

export function getOrderAccessEmailPayloadResolver(): OrderAccessEmailPayloadResolver {
  if (isLocalSandbox()) {
    return createOrderAccessEmailPayloadResolver({
      tokenKey: sandboxTokenKey,
      resolveRecipient: async (recipientRef) =>
        recipientRef === SANDBOX_ORDER_ACCESS_RECIPIENT_REF
          ? "buyer@example.com"
          : null,
    });
  }
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY
  ) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_RECIPIENT_REPOSITORY_UNAVAILABLE",
      "The order access recipient resolver is unavailable.",
      503,
    );
  }
  const client = getPrivilegedSupabaseClient();
  const piiEncryptionKey = decodeOrderAccessSecret(
    process.env.ORDER_PII_ENCRYPTION_KEY_V1,
    "ORDER_PII_ENCRYPTION_KEY_V1",
  );
  return createOrderAccessEmailPayloadResolver({
    tokenKey: decodeOrderAccessSecret(
      process.env.ORDER_ACCESS_TOKEN_SECRET,
      "ORDER_ACCESS_TOKEN_SECRET",
    ),
    resolveRecipient: async (recipientRef, challengeId) => {
      const { data, error } = await client
        .schema("api")
        .rpc("worker_order_access_recipient_resolve", {
          p_challenge_id: challengeId,
          p_recipient_ref: recipientRef,
        });
      if (error) {
        throw new CommerceDomainError(
          "ORDER_ACCESS_RECIPIENT_REPOSITORY_UNAVAILABLE",
          "The order access recipient resolver is unavailable.",
          503,
        );
      }
      const parsed = z
        .union([
          recipientEnvelopeSchema,
          z.null(),
        ])
        .safeParse(
          Array.isArray(data) && data.length === 1
            ? data[0]
            : data,
        );
      if (!parsed.success) {
        throw new CommerceDomainError(
          "ORDER_ACCESS_RECIPIENT_INVALID_RESPONSE",
          "The order access recipient resolver returned invalid data.",
          503,
        );
      }
      if (!parsed.data) return null;
      if (
        parsed.data.keyVersion !== 1 ||
        parsed.data.contactEnvelope.keyVersion !==
          parsed.data.keyVersion
      ) {
        throw new CommerceDomainError(
          "ORDER_ACCESS_PII_KEY_UNAVAILABLE",
          "The order contact encryption key is unavailable.",
          503,
        );
      }
      const plaintext = decryptEnvelope(
        parsed.data.contactEnvelope,
        {
          schema: "commerce_private",
          table: "order_pii",
          rowId: parsed.data.orderId,
          column: "contact_envelope",
          schemaVersion: parsed.data.schemaVersion,
        },
        piiEncryptionKey,
      );
      let contact: unknown;
      try {
        contact = JSON.parse(plaintext) as unknown;
      } catch {
        throw new CommerceDomainError(
          "ORDER_ACCESS_CONTACT_INVALID",
          "The encrypted order contact is invalid.",
          503,
        );
      }
      const contactResult = z
        .object({ email: z.string().email().max(254) })
        .safeParse(contact);
      if (!contactResult.success) {
        throw new CommerceDomainError(
          "ORDER_ACCESS_CONTACT_INVALID",
          "The encrypted order contact is invalid.",
          503,
        );
      }
      return contactResult.data.email;
    },
  });
}

export function resetSandboxOrderAccessForTests(input?: {
  readonly now?: () => number;
}): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Sandbox order access may only be reset by tests.");
  }
  const globalObject = globalThis as OrderAccessGlobal;
  globalObject[sandboxBundleKey] = createSandboxBundle(input);
}

export function getSandboxAccessDeliveryForTests(
  publicId: string,
): SandboxAccessDelivery | null {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Sandbox order access deliveries may only be read by tests.",
    );
  }
  return (
    getSandboxBundle().deliveries.get(publicId.toUpperCase()) ??
    null
  );
}
