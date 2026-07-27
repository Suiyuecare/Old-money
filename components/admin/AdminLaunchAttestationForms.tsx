"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { recordLaunchAttestationAction } from "@/lib/admin/governance-actions";
import type {
  AdminLaunchAttestation,
  AdminLaunchAttestationKind,
  AdminRuntimeControls,
} from "@/lib/admin/governance";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminForms";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState<AdminLaunchAttestation> = {
  status: "idle",
  message: "",
};

const attestationCopy: Readonly<
  Record<
    AdminLaunchAttestationKind,
    {
      readonly eyebrow: string;
      readonly title: string;
      readonly valueLabel: string;
      readonly valueHelp: string;
      readonly submitLabel: string;
    }
  >
> = {
  catalog: {
    eyebrow: "Catalog Approval",
    title: "商品事實核准",
    valueLabel: "商品核准版本",
    valueHelp: "輸入將部署於 LIGNEE_CATALOG_APPROVAL_REVISION 的精確版本值。",
    submitLabel: "記錄商品核准",
  },
  legal: {
    eyebrow: "Legal Approval",
    title: "法律文案核准",
    valueLabel: "法律核准版本",
    valueHelp: "輸入將部署於 LIGNEE_LEGAL_APPROVAL_REVISION 的精確版本值。",
    submitLabel: "記錄法律核准",
  },
  canary: {
    eyebrow: "Canary Evidence",
    title: "小額實單證據",
    valueLabel: "Canary 證據 SHA-256",
    valueHelp: "必須是 64 位小寫 SHA-256；durable value 與 evidence SHA 會使用同一值。",
    submitLabel: "記錄 Canary 證據",
  },
};

function durableValue(value: string | null): string {
  return value ?? "尚未記錄";
}

function fieldError(
  state: AdminActionState<unknown>,
  field: "value" | "evidenceSha256",
): string | null {
  return state.fieldErrors?.[field] ?? null;
}

export function AdminLaunchAttestationForms({
  controls,
}: {
  readonly controls: AdminRuntimeControls;
}) {
  return (
    <section
      className="admin-workbench"
      aria-labelledby="launch-attestations-heading"
    >
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Append-only Evidence</span>
          <h2 id="launch-attestations-heading">上線證據</h2>
          <p>
            記錄不會覆寫歷史資料。部署環境的精確值必須與最新 durable
            attestation 相同，正式能力才可能通過 gate。
          </p>
        </div>
        <span>Controls v{controls.version}</span>
      </header>

      <dl
        className="admin-launch-attestation-values"
        aria-label="目前最新的 durable 上線證據"
      >
        <div>
          <dt>商品核准版本</dt>
          <dd>{durableValue(controls.catalogApprovalRevision)}</dd>
        </div>
        <div>
          <dt>法律核准版本</dt>
          <dd>{durableValue(controls.legalApprovalRevision)}</dd>
        </div>
        <div>
          <dt>Canary 證據 SHA-256</dt>
          <dd>{durableValue(controls.canaryEvidenceSha256)}</dd>
        </div>
      </dl>

      <p className="admin-form-help">
        這是 Owner 高風險操作，送出前須在最近 10 分鐘內完成 TOTP。{" "}
        <Link href="/admin/mfa/challenge?returnPath=/admin/settings">
          重新驗證 TOTP
        </Link>
      </p>

      <div className="admin-release-batch-list">
        {(["catalog", "legal", "canary"] as const).map((kind) => (
          <LaunchAttestationForm
            controlsVersion={controls.version}
            key={kind}
            kind={kind}
          />
        ))}
      </div>
    </section>
  );
}

function LaunchAttestationForm({
  controlsVersion,
  kind,
}: {
  readonly controlsVersion: number;
  readonly kind: AdminLaunchAttestationKind;
}) {
  const [state, action, pending] = useActionState(
    recordLaunchAttestationAction,
    idle,
  );
  const idempotencyKey = useAdminIdempotencyKey(state);
  const [canarySha256, setCanarySha256] = useState("");
  const copy = attestationCopy[kind];
  const valueError = fieldError(state, "value");
  const evidenceError = fieldError(state, "evidenceSha256");
  const valueId = `launch-${kind}-value`;
  const valueHelpId = `${valueId}-help`;
  const valueErrorId = `${valueId}-error`;
  const evidenceId = `launch-${kind}-evidence`;
  const evidenceHelpId = `${evidenceId}-help`;
  const evidenceErrorId = `${evidenceId}-error`;
  return (
    <form
      action={action}
      aria-busy={pending}
      className="admin-form admin-release-batch"
    >
      <input
        name="expectedControlsVersion"
        type="hidden"
        value={controlsVersion}
      />
      <input name="kind" type="hidden" value={kind} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${idempotencyKey}:${controlsVersion}:${kind}`}
      />
      <span className="admin-eyebrow">{copy.eyebrow}</span>
      <h3>{copy.title}</h3>

      <label htmlFor={valueId}>
        {copy.valueLabel}
        <input
          aria-describedby={`${valueHelpId}${valueError ? ` ${valueErrorId}` : ""}`}
          aria-invalid={Boolean(valueError)}
          autoCapitalize="none"
          autoComplete="off"
          id={valueId}
          inputMode={kind === "canary" ? "text" : undefined}
          maxLength={kind === "canary" ? 64 : 160}
          minLength={kind === "canary" ? 64 : 1}
          name="value"
          onChange={kind === "canary"
            ? (event) => setCanarySha256(event.target.value)
            : undefined}
          pattern={kind === "canary" ? "[a-f0-9]{64}" : undefined}
          required
          spellCheck={false}
          type="text"
          value={kind === "canary" ? canarySha256 : undefined}
        />
      </label>
      <p className="admin-form-help" id={valueHelpId}>{copy.valueHelp}</p>
      {valueError ? (
        <small className="admin-field-error" id={valueErrorId}>
          {valueError}
        </small>
      ) : null}

      {kind === "canary" ? (
        <input
          name="evidenceSha256"
          type="hidden"
          value={canarySha256}
        />
      ) : (
        <>
          <label htmlFor={evidenceId}>
            核准證據 SHA-256
            <input
              aria-describedby={`${evidenceHelpId}${evidenceError ? ` ${evidenceErrorId}` : ""}`}
              aria-invalid={Boolean(evidenceError)}
              autoCapitalize="none"
              autoComplete="off"
              id={evidenceId}
              maxLength={64}
              minLength={64}
              name="evidenceSha256"
              pattern="[a-f0-9]{64}"
              required
              spellCheck={false}
              type="text"
            />
          </label>
          <p className="admin-form-help" id={evidenceHelpId}>
            輸入核准文件或封存證據內容的 64 位小寫 SHA-256。
          </p>
          {evidenceError ? (
            <small className="admin-field-error" id={evidenceErrorId}>
              {evidenceError}
            </small>
          ) : null}
        </>
      )}

      <ActionFeedback state={state} />
      <div className="admin-subform__actions">
        <button className="admin-button" disabled={pending} type="submit">
          {pending ? "記錄中…" : copy.submitLabel}
        </button>
      </div>
    </form>
  );
}
