"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { updateRuntimeControlsAction } from "@/lib/admin/governance-actions";
import type {
  AdminRuntimeControls,
  AdminRuntimeControlsPayload,
} from "@/lib/admin/governance";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminForms";
import { AdminStatus, formatAdminDate } from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState<AdminRuntimeControls> = {
  status: "idle",
  message: "",
};

type BooleanControl = keyof AdminRuntimeControlsPayload;

const controlCopy: readonly {
  readonly key: BooleanControl;
  readonly label: string;
  readonly description: string;
  readonly risk: "commerce" | "publication" | "cache";
}[] = [
  {
    key: "commerceLive",
    label: "正式交易總開關",
    description: "允許其他交易開關進入候選狀態；仍不能越過 deployment 硬上限。",
    risk: "commerce",
  },
  {
    key: "checkoutEnabled",
    label: "公開結帳",
    description: "允許公開結帳流程；必須先開啟正式交易總開關。",
    risk: "commerce",
  },
  {
    key: "productionCanaryEnabled",
    label: "Production Canary",
    description: "允許符合 canary 條件的實單驗證；不等於全面開放。",
    risk: "commerce",
  },
  {
    key: "ecpayApplePayEnabled",
    label: "綠界 Apple Pay",
    description: "在綠界 Hosted Checkout 顯示 Apple Pay；必須先開啟公開結帳。",
    risk: "commerce",
  },
  {
    key: "searchIndexEnabled",
    label: "搜尋引擎索引",
    description: "允許正式網站被搜尋引擎收錄；品牌展示階段應保持關閉。",
    risk: "publication",
  },
  {
    key: "catalogEmergencyNoCache",
    label: "Catalog 緊急略過快取",
    description: "事故期間強制目錄讀取避開共享快取，會增加資料庫負載。",
    risk: "cache",
  },
  {
    key: "mediaEmergencyNoCache",
    label: "Media 緊急略過快取",
    description: "媒體撤銷或安全事件時避開快取，以最新版核准狀態為準。",
    risk: "cache",
  },
] as const;

function initialValues(controls: AdminRuntimeControls): AdminRuntimeControlsPayload {
  return {
    commerceLive: controls.commerceLive,
    checkoutEnabled: controls.checkoutEnabled,
    productionCanaryEnabled: controls.productionCanaryEnabled,
    ecpayApplePayEnabled: controls.ecpayApplePayEnabled,
    searchIndexEnabled: controls.searchIndexEnabled,
    catalogEmergencyNoCache: controls.catalogEmergencyNoCache,
    mediaEmergencyNoCache: controls.mediaEmergencyNoCache,
  };
}

function riskLabel(risk: "commerce" | "publication" | "cache"): string {
  return {
    commerce: "交易風險",
    publication: "公開範圍",
    cache: "事故控制",
  }[risk];
}

export function AdminRuntimeControlsForm({
  controls,
  deploymentMode,
  commerceCapable,
  launchGates,
}: {
  readonly controls: AdminRuntimeControls;
  readonly deploymentMode: "demo" | "production-disabled" | "live";
  readonly commerceCapable: boolean;
  readonly launchGates: {
    readonly providerCredentialsConfigured: boolean;
    readonly databaseConfigured: boolean;
    readonly operationalFactsConfigured: boolean;
    readonly workerAuthorizationConfigured: boolean;
    readonly incidentChannelConfigured: boolean;
    readonly deadmanConfigured: boolean;
    readonly catalogFactsApproved: boolean;
    readonly legalFactsApproved: boolean;
    readonly productionCanaryCompleted: boolean;
  };
}) {
  const [state, action, pending] = useActionState(updateRuntimeControlsAction, idle);
  const [values, setValues] = useState(() => initialValues(controls));
  const idempotencyKey = useAdminIdempotencyKey(state);
  const canaryPrerequisitesSatisfied =
    deploymentMode === "live"
    && commerceCapable
    && launchGates.providerCredentialsConfigured
    && launchGates.databaseConfigured
    && launchGates.operationalFactsConfigured
    && launchGates.workerAuthorizationConfigured
    && launchGates.incidentChannelConfigured
    && launchGates.deadmanConfigured
    && launchGates.catalogFactsApproved
    && launchGates.legalFactsApproved;
  const deploymentAllowsPayments =
    canaryPrerequisitesSatisfied && launchGates.productionCanaryCompleted;
  const runtimeAllowsPayments = values.commerceLive && values.checkoutEnabled;
  const effectivePayments = deploymentAllowsPayments && runtimeAllowsPayments;

  const setControl = (key: BooleanControl, checked: boolean) => {
    setValues((current) => {
      const next = { ...current, [key]: checked };
      if (key === "commerceLive" && !checked) {
        next.checkoutEnabled = false;
        next.ecpayApplePayEnabled = false;
      }
      if (key === "checkoutEnabled" && !checked) {
        next.ecpayApplePayEnabled = false;
      }
      return next;
    });
  };

  return (
    <form action={action} className="admin-runtime-form admin-form">
      <input name="expectedVersion" type="hidden" value={controls.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${idempotencyKey}:${controls.version}`}
      />

      <section className="admin-runtime-boundary" aria-labelledby="deployment-boundary-heading">
        <div>
          <span className="admin-eyebrow">Deployment Upper Bound</span>
          <h2 id="deployment-boundary-heading">收款硬上限</h2>
          <p>
            Runtime Controls 只能進一步收緊能力，不能越過 deployment 的
            <code>LIGNEE_MODE</code> 與 <code>COMMERCE_CAPABLE</code>。
          </p>
        </div>
        <dl>
          <div>
            <dt>Deployment</dt>
            <dd>{deploymentMode}</dd>
          </div>
          <div>
            <dt>Commerce capable</dt>
            <dd>{commerceCapable ? "是" : "否"}</dd>
          </div>
          <div>
            <dt>有效收款</dt>
            <dd>
              <AdminStatus
                label={effectivePayments ? "允許" : "禁止"}
                value={effectivePayments ? "active" : "revoked"}
              />
            </dd>
          </div>
        </dl>
        <dl aria-label="正式開站必要條件">
          {([
            ["金流／發票／物流／Email credentials", launchGates.providerCredentialsConfigured],
            ["獨立營運資料庫", launchGates.databaseConfigured],
            ["公司與客服法律資料", launchGates.operationalFactsConfigured],
            ["背景工作授權", launchGates.workerAuthorizationConfigured],
            ["事故通知", launchGates.incidentChannelConfigured],
            ["背景工作 deadman", launchGates.deadmanConfigured],
            ["商品事實核准版本", launchGates.catalogFactsApproved],
            ["法律文案核准版本", launchGates.legalFactsApproved],
            ["小額 canary 證據", launchGates.productionCanaryCompleted],
          ] as const).map(([label, ready]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <AdminStatus
                  label={ready ? "完成" : "未完成"}
                  value={ready ? "active" : "revoked"}
                />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {!deploymentAllowsPayments ? (
        <p className="admin-runtime-warning" role="alert">
          本次 deployment 或必要證據仍禁止正式收款。即使資料庫內的交易開關被儲存為開啟，
          也不能建立正式付款；需先完成 credentials、商品事實、法律資料與小額 canary。
        </p>
      ) : null}

      <section className="admin-workbench" aria-labelledby="runtime-controls-heading">
        <header className="admin-workbench__header">
          <div>
            <span className="admin-eyebrow">Versioned Singleton</span>
            <h2 id="runtime-controls-heading">開關設定</h2>
            <p>
              目前版本 v{controls.version}；媒體安全修訂 v{controls.mediaSafetyRevision}。
              每次儲存都檢查 expected version、最近 AAL2，並追加 Audit Log。
            </p>
          </div>
          <span>
            更新於{" "}
            <time dateTime={controls.updatedAt}>{formatAdminDate(controls.updatedAt)}</time>
          </span>
        </header>

        <div className="admin-runtime-control-list">
          {controlCopy.map((control) => {
            const dependencyDisabled =
              (control.key === "checkoutEnabled" && !values.commerceLive)
              || (control.key === "ecpayApplePayEnabled" && !values.checkoutEnabled);
            return (
              <label className="admin-runtime-control" key={control.key}>
                <span className="admin-runtime-control__copy">
                  <span>
                    <strong>{control.label}</strong>
                    <small className="admin-risk-label">{riskLabel(control.risk)}</small>
                  </span>
                  <small>{control.description}</small>
                </span>
                <span className="admin-runtime-switch">
                  <input
                    checked={values[control.key]}
                    disabled={pending || dependencyDisabled}
                    name={control.key}
                    onChange={(event) => setControl(control.key, event.target.checked)}
                    type="checkbox"
                  />
                  <span aria-hidden="true">{values[control.key] ? "開啟" : "關閉"}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="admin-runtime-summary" aria-live="polite">
          <span>Runtime 交易狀態：{runtimeAllowsPayments ? "候選開啟" : "關閉"}</span>
          <span>Deployment 有效結果：{effectivePayments ? "允許收款" : "禁止收款"}</span>
        </div>

        <div className="admin-runtime-actions">
          <p className="admin-form-help">
            這是高風險操作，須在最近 10 分鐘內完成 TOTP。{" "}
            <Link href="/admin/mfa/challenge?returnPath=/admin/settings">重新驗證 TOTP</Link>
          </p>
          <ActionFeedback state={state} />
          <button className="admin-button" disabled={pending} type="submit">
            {pending ? "套用中…" : "儲存 Runtime Controls"}
          </button>
        </div>
      </section>
    </form>
  );
}
