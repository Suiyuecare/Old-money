import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AdminRepositoryError } from "@/lib/admin/errors";
import {
  createRpcAdminGovernanceAdapter,
  launchAttestationCommandSchema,
  runtimeControlsPayloadFromFormData,
  runtimeControlsRequestHash,
  type AdminGovernanceRpcClient,
  type AdminLaunchAttestationCommand,
  type AdminRuntimeControls,
  type AdminRuntimeControlsPayload,
} from "@/lib/admin/governance";

const controls = {
  version: 7,
  mediaSafetyRevision: 12,
  commerceLive: false,
  checkoutEnabled: false,
  productionCanaryEnabled: false,
  ecpayApplePayEnabled: false,
  searchIndexEnabled: false,
  catalogEmergencyNoCache: true,
  mediaEmergencyNoCache: true,
  catalogApprovalRevision: "catalog-2026-07-28",
  legalApprovalRevision: "legal-2026-07-28",
  canaryEvidenceSha256: "a".repeat(64),
  updatedAt: "2026-07-28T00:00:00.000Z",
} as const;

const payload: AdminRuntimeControlsPayload = {
  commerceLive: true,
  checkoutEnabled: true,
  productionCanaryEnabled: true,
  ecpayApplePayEnabled: false,
  searchIndexEnabled: false,
  catalogEmergencyNoCache: false,
  mediaEmergencyNoCache: true,
};

function runtimeMutationDocument(document: AdminRuntimeControls) {
  return {
    version: document.version,
    mediaSafetyRevision: document.mediaSafetyRevision,
    commerceLive: document.commerceLive,
    checkoutEnabled: document.checkoutEnabled,
    productionCanaryEnabled: document.productionCanaryEnabled,
    ecpayApplePayEnabled: document.ecpayApplePayEnabled,
    searchIndexEnabled: document.searchIndexEnabled,
    catalogEmergencyNoCache: document.catalogEmergencyNoCache,
    mediaEmergencyNoCache: document.mediaEmergencyNoCache,
    updatedAt: document.updatedAt,
  };
}

describe("admin governance RPC adapter", () => {
  it("uses the exact versioned runtime RPC contract and a deterministic request hash", async () => {
    const calls: { readonly name: string; readonly args?: Readonly<Record<string, unknown>> }[] = [];
    let currentControls: AdminRuntimeControls = controls;
    const client: AdminGovernanceRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === "admin_runtime_controls_update") {
          currentControls = { ...controls, ...payload, version: 8 };
          return {
            data: runtimeMutationDocument(currentControls),
            error: null,
          };
        }
        return { data: currentControls, error: null };
      },
    };
    const adapter = createRpcAdminGovernanceAdapter(async () => client);
    await expect(adapter.readRuntimeControls()).resolves.toEqual(controls);
    await expect(adapter.updateRuntimeControls({
      expectedVersion: 7,
      idempotencyKey: "9d006ccc-cab1-40bb-83f2-e475de0f8567",
      payload,
    })).resolves.toMatchObject({ version: 8, commerceLive: true });

    expect(calls[0]).toEqual({
      name: "admin_runtime_controls_read",
      args: {},
    });
    expect(calls[1]).toEqual({
      name: "admin_runtime_controls_update",
      args: {
        p_expected_version: 7,
        p_idempotency_key: "9d006ccc-cab1-40bb-83f2-e475de0f8567",
        p_request_hash: runtimeControlsRequestHash(7, payload),
        p_payload: payload,
      },
    });
    expect(calls[2]).toEqual({
      name: "admin_runtime_controls_read",
      args: {},
    });
    expect(runtimeControlsRequestHash(7, payload)).toMatch(/^[a-f0-9]{64}$/);
    expect(runtimeControlsRequestHash(7, payload)).toBe(
      createHash("sha256").update(
        "{\"expectedVersion\":7,\"operation\":\"runtime_controls.update\",\"payload\":{\"catalogEmergencyNoCache\":false,\"checkoutEnabled\":true,\"commerceLive\":true,\"ecpayApplePayEnabled\":false,\"mediaEmergencyNoCache\":true,\"productionCanaryEnabled\":true,\"searchIndexEnabled\":false}}",
      ).digest("hex"),
    );
  });

  it("records launch attestations using the canonical RPC arguments", async () => {
    const calls: {
      readonly name: string;
      readonly args?: Readonly<Record<string, unknown>>;
    }[] = [];
    const command: AdminLaunchAttestationCommand = {
      expectedControlsVersion: 7,
      kind: "catalog",
      value: "catalog-2026-07-28",
      evidenceSha256: "b".repeat(64),
      idempotencyKey: "b2ac40a9-7f3b-4204-9ff2-6cb12a0fd79d",
    };
    const client: AdminGovernanceRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        return {
          data: {
            id: "00000000-0000-4000-8000-000000000301",
            kind: command.kind,
            value: command.value,
            evidenceSha256: command.evidenceSha256,
            controlsVersion: 8,
            recordedAt: "2026-07-28T01:00:00.000Z",
          },
          error: null,
        };
      },
    };
    await expect(
      createRpcAdminGovernanceAdapter(async () => client)
        .recordLaunchAttestation(command),
    ).resolves.toMatchObject({
      kind: "catalog",
      controlsVersion: 8,
    });
    expect(calls).toEqual([{
      name: "admin_launch_attestation_record",
      args: {
        p_expected_controls_version: 7,
        p_kind: "catalog",
        p_value: "catalog-2026-07-28",
        p_evidence_sha256: "b".repeat(64),
        p_idempotency_key: "b2ac40a9-7f3b-4204-9ff2-6cb12a0fd79d",
      },
    }]);
  });

  it("requires a strict runtime document with nullable durable evidence", async () => {
    const nullable = createRpcAdminGovernanceAdapter(async () => ({
      async rpc() {
        return {
          data: {
            ...controls,
            catalogApprovalRevision: null,
            legalApprovalRevision: null,
            canaryEvidenceSha256: null,
          },
          error: null,
        };
      },
    }));
    await expect(nullable.readRuntimeControls()).resolves.toMatchObject({
      catalogApprovalRevision: null,
      legalApprovalRevision: null,
      canaryEvidenceSha256: null,
    });

    const extraField = createRpcAdminGovernanceAdapter(async () => ({
      async rpc() {
        return {
          data: { ...controls, internalActorId: "should-not-cross-boundary" },
          error: null,
        };
      },
    }));
    await expect(extraField.readRuntimeControls()).rejects.toMatchObject({
      code: "ADMIN_GOVERNANCE_RPC_INVALID_RESPONSE",
      status: 502,
    });
  });

  it("uses the owner-only paginated audit RPC without requesting actor PII", async () => {
    const calls: { readonly name: string; readonly args?: Readonly<Record<string, unknown>> }[] = [];
    const client: AdminGovernanceRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        return {
          data: {
            items: [{
              id: "00000000-0000-4000-8000-000000000201",
              actorScope: "admin",
              action: "runtime_controls.update",
              entityType: "runtime_controls",
              entityId: "singleton",
              changedFields: ["checkout_enabled", "revision"],
              requestId: "9d006ccc-cab1-40bb-83f2-e475de0f8567",
              occurredAt: "2026-07-28T00:00:00.000Z",
            }],
            total: 1,
            limit: 50,
            offset: 0,
          },
          error: null,
        };
      },
    };
    const result = await createRpcAdminGovernanceAdapter(async () => client)
      .listAuditEvents({
        limit: 50,
        offset: 0,
        entityType: "runtime_controls",
        action: "runtime_controls.update",
      });
    expect(result.items[0]).not.toHaveProperty("actorId");
    expect(result.items[0]).not.toHaveProperty("email");
    expect(calls).toEqual([{
      name: "admin_audit_list",
      args: {
        p_limit: 50,
        p_offset: 0,
        p_entity_type: "runtime_controls",
        p_action: "runtime_controls.update",
      },
    }]);
  });

  it("fails closed for a missing RPC, malformed response, or stale version", async () => {
    const missing = createRpcAdminGovernanceAdapter(async () => ({
      async rpc() {
        return {
          data: null,
          error: { code: "PGRST202", message: "function not found" },
        };
      },
    }));
    await expect(missing.readRuntimeControls()).rejects.toMatchObject({
      code: "ADMIN_GOVERNANCE_RPC_UNAVAILABLE",
      status: 503,
    });

    const malformed = createRpcAdminGovernanceAdapter(async () => ({
      async rpc() {
        return { data: { commerceLive: true }, error: null };
      },
    }));
    await expect(malformed.readRuntimeControls()).rejects.toMatchObject({
      code: "ADMIN_GOVERNANCE_RPC_INVALID_RESPONSE",
      status: 502,
    });

    const stale = createRpcAdminGovernanceAdapter(async () => ({
      async rpc() {
        return {
          data: null,
          error: { message: "ROW_VERSION_CONFLICT" },
        };
      },
    }));
    await expect(stale.updateRuntimeControls({
      expectedVersion: 6,
      idempotencyKey: "203ebf91-0d16-4190-812e-ad0bf79160cc",
      payload,
    })).rejects.toMatchObject({
      code: "ROW_VERSION_CONFLICT",
      status: 409,
    });
  });
});

describe("admin runtime action boundary", () => {
  it("parses every checkbox and rejects unsafe dependency combinations", () => {
    const form = new FormData();
    form.set("commerceLive", "on");
    form.set("checkoutEnabled", "on");
    form.set("productionCanaryEnabled", "on");
    form.set("catalogEmergencyNoCache", "on");
    expect(runtimeControlsPayloadFromFormData(form)).toEqual({
      commerceLive: true,
      checkoutEnabled: true,
      productionCanaryEnabled: true,
      ecpayApplePayEnabled: false,
      searchIndexEnabled: false,
      catalogEmergencyNoCache: true,
      mediaEmergencyNoCache: false,
    });

    const invalid = new FormData();
    invalid.set("checkoutEnabled", "on");
    expect(() => runtimeControlsPayloadFromFormData(invalid)).toThrow();
  });

  it("validates launch revisions, evidence SHA and canary equality", () => {
    expect(launchAttestationCommandSchema.parse({
      expectedControlsVersion: 7,
      kind: "legal",
      value: "legal-2026-07-28",
      evidenceSha256: "c".repeat(64),
      idempotencyKey: "8f14e3db-577b-46a2-b7f8-1910d7bf31ae",
    })).toMatchObject({
      kind: "legal",
      value: "legal-2026-07-28",
    });
    expect(() => launchAttestationCommandSchema.parse({
      expectedControlsVersion: 7,
      kind: "canary",
      value: "d".repeat(64),
      evidenceSha256: "e".repeat(64),
      idempotencyKey: "bff39b9c-4e60-4473-a1f5-f019727689de",
    })).toThrow(/Canary/);
  });

  it("revalidates Origin, Owner role and recent AAL2 before mutation", () => {
    const source = readFileSync(
      new URL("../lib/admin/governance-actions.ts", import.meta.url),
      "utf8",
    );
    const origin = source.indexOf("await assertAdminMutationOrigin()");
    const owner = source.indexOf("await requireAdminRole([\"owner\"])");
    const recentAal2 = source.indexOf("await requireRecentAal2()");
    const update = source.indexOf(".updateRuntimeControls({");
    expect(origin).toBeGreaterThan(0);
    expect(owner).toBeGreaterThan(origin);
    expect(recentAal2).toBeGreaterThan(owner);
    expect(update).toBeGreaterThan(recentAal2);
    expect(source).toContain("expectedVersion");
    expect(source).toContain("idempotencyKey");

    const recordStart = source.indexOf(
      "export async function recordLaunchAttestationAction",
    );
    const recordSource = source.slice(recordStart);
    const recordOrigin = recordSource.indexOf(
      "await assertAdminMutationOrigin()",
    );
    const recordOwner = recordSource.indexOf(
      "await requireAdminRole([\"owner\"])",
    );
    const recordRecentAal2 = recordSource.indexOf(
      "await requireRecentAal2()",
    );
    const recordMutation = recordSource.indexOf(
      ".recordLaunchAttestation(command)",
    );
    expect(recordStart).toBeGreaterThan(0);
    expect(recordOrigin).toBeGreaterThan(0);
    expect(recordOwner).toBeGreaterThan(recordOrigin);
    expect(recordRecentAal2).toBeGreaterThan(recordOwner);
    expect(recordMutation).toBeGreaterThan(recordRecentAal2);
    expect(recordSource).toContain('revalidatePath("/admin/settings")');
    expect(recordSource).toContain('revalidatePath("/admin/audit")');
  });

  it("renders retry-stable, accessible Owner evidence forms", () => {
    const source = readFileSync(
      new URL(
        "../components/admin/AdminLaunchAttestationForms.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain("useAdminIdempotencyKey(state)");
    expect(source).toContain('name="expectedControlsVersion"');
    expect(source).toContain('aria-busy={pending}');
    expect(source).toContain('pattern="[a-f0-9]{64}"');
    expect(source).toContain("catalogApprovalRevision");
    expect(source).toContain("legalApprovalRevision");
    expect(source).toContain("canaryEvidenceSha256");
  });

  it("uses structured repository errors instead of leaking provider details", () => {
    const error = new AdminRepositoryError("ROW_VERSION_CONFLICT", "重新整理", 409);
    expect(error).toMatchObject({
      code: "ROW_VERSION_CONFLICT",
      message: "重新整理",
      status: 409,
    });
  });
});
