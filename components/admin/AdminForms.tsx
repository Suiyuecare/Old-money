"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";

import {
  adjustInventoryAction,
  archiveProductAction,
  beginMfaEnrollmentAction,
  confirmInviteAction,
  createProductAction,
  publishProductAction,
  signInAction,
  updateProductAction,
  verifyMfaChallengeAction,
  verifyMfaEnrollmentAction,
  type MfaEnrollmentData,
} from "@/lib/admin/actions";
import type {
  AdminActionState,
  AdminProductDraft,
  InventorySummary,
} from "@/lib/admin/types";
import type { AdminTaxonomyItem } from "@/lib/admin/taxonomy";

import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

export function ActionFeedback({ state }: { readonly state: AdminActionState<unknown> }) {
  if (state.status === "idle") return null;
  return (
    <p className="admin-feedback" data-status={state.status} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
      {state.code ? <small>{state.code}</small> : null}
    </p>
  );
}

function SubmitButton({ children }: { readonly children: React.ReactNode }) {
  return <button className="admin-button" type="submit">{children}</button>;
}

export function SignInForm({
  returnPath = "/admin",
  unconfigured = false,
}: {
  readonly returnPath?: string;
  readonly unconfigured?: boolean;
}) {
  const [state, action, pending] = useActionState(signInAction, idle);
  return (
    <form action={action} className="admin-form admin-auth-form">
      <input name="returnPath" type="hidden" value={returnPath} />
      {unconfigured ? (
        <p className="admin-feedback" data-status="error" role="alert">
          正式 Auth／membership 尚未完成綁定，因此後台安全地保持關閉。
        </p>
      ) : null}
      <label>管理員 Email<input autoComplete="username" inputMode="email" name="email" required type="email" /></label>
      <label>密碼<input autoComplete="current-password" minLength={12} name="password" required type="password" /></label>
      <ActionFeedback state={state} />
      <SubmitButton>{pending ? "驗證中…" : "繼續"}</SubmitButton>
    </form>
  );
}

export function InviteConfirmationForm({ tokenHash }: { readonly tokenHash: string }) {
  const [state, action, pending] = useActionState(confirmInviteAction, idle);
  return (
    <form action={action} className="admin-form admin-auth-form">
      <input name="tokenHash" type="hidden" value={tokenHash} />
      <label>建立密碼<input autoComplete="new-password" minLength={12} name="password" required type="password" /></label>
      <label>再次輸入密碼<input autoComplete="new-password" minLength={12} name="passwordConfirmation" required type="password" /></label>
      <p className="admin-form-help">至少 12 個字元；請使用密碼管理器建立專用密碼。</p>
      <ActionFeedback state={state} />
      <SubmitButton>{pending ? "設定中…" : "接受邀請並設定 MFA"}</SubmitButton>
    </form>
  );
}

export function MfaEnrollmentForm({ label }: { readonly label: "primary" | "backup" }) {
  const initial: AdminActionState<MfaEnrollmentData> = { status: "idle", message: "" };
  const [enrollState, enrollAction, enrolling] = useActionState(beginMfaEnrollmentAction, initial);
  const [verifyState, verifyAction, verifying] = useActionState(verifyMfaEnrollmentAction, idle);

  if (!enrollState.data) {
    return (
      <form action={enrollAction} className="admin-form admin-auth-form">
        <input name="label" type="hidden" value={label} />
        <p>使用 1Password、Apple 密碼或其他 TOTP 驗證器。主要與備用驗證器應儲存在不同裝置。</p>
        <ActionFeedback state={enrollState} />
        <SubmitButton>{enrolling ? "建立中…" : `設定${label === "primary" ? "主要" : "備用"}驗證器`}</SubmitButton>
      </form>
    );
  }

  return (
    <div className="admin-mfa-enrollment">
      <Image
        alt="LIGNÉE TOTP 設定 QR Code"
        className="admin-qr"
        height={220}
        src={enrollState.data.qrCode}
        unoptimized
        width={220}
      />
      <p>無法掃描時，手動輸入密鑰：</p>
      <code>{enrollState.data.secret}</code>
      <form action={verifyAction} className="admin-form admin-auth-form">
        <input name="factorId" type="hidden" value={enrollState.data.factorId} />
        <label>6 位數驗證碼<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} name="code" pattern="[0-9]{6}" required /></label>
        <ActionFeedback state={verifyState} />
        <SubmitButton>{verifying ? "驗證中…" : "驗證並儲存"}</SubmitButton>
      </form>
    </div>
  );
}

export function MfaChallengeForm({
  factors,
  returnPath,
}: {
  readonly factors: readonly { readonly id: string; readonly label: string }[];
  readonly returnPath: string;
}) {
  const [state, action, pending] = useActionState(verifyMfaChallengeAction, idle);
  return (
    <form action={action} className="admin-form admin-auth-form">
      <input name="returnPath" type="hidden" value={returnPath} />
      <label>
        使用驗證器
        <select defaultValue={factors[0]?.id} name="factorId" required>
          {factors.map((factor) => (
            <option key={factor.id} value={factor.id}>{factor.label}</option>
          ))}
        </select>
      </label>
      <label>驗證器代碼<input autoComplete="one-time-code" autoFocus inputMode="numeric" maxLength={6} name="code" pattern="[0-9]{6}" required /></label>
      <ActionFeedback state={state} />
      <SubmitButton>{pending ? "驗證中…" : "進入後台"}</SubmitButton>
    </form>
  );
}

function fieldError(state: AdminActionState, field: string) {
  const error = state.fieldErrors?.[field];
  return error ? <small className="admin-field-error">{error}</small> : null;
}

export function ProductEditor({
  product,
  categories,
  chapters,
}: {
  readonly product?: AdminProductDraft;
  readonly categories?: readonly AdminTaxonomyItem[];
  readonly chapters?: readonly AdminTaxonomyItem[];
}) {
  const serverAction = product ? updateProductAction : createProductAction;
  const [state, action, pending] = useActionState(serverAction, idle);
  const [editRevision, setEditRevision] = useState(0);
  const [submittedRevision, setSubmittedRevision] = useState(0);
  const idempotencyKey = useAdminIdempotencyKey(state);
  const dirty = state.status === "error" || editRevision !== submittedRevision;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form
      action={(formData) => {
        setSubmittedRevision(editRevision);
        action(formData);
      }}
      className="admin-product-editor admin-form"
      onInput={() => setEditRevision((revision) => revision + 1)}
    >
      <input name="idempotencyKey" type="hidden" value={`${idempotencyKey}:${editRevision}`} />
      {product ? <><input name="id" type="hidden" value={product.id} /><input name="expectedVersion" type="hidden" value={product.version} /></> : null}

      <fieldset>
        <legend>基本資料</legend>
        <div className="admin-form-grid">
          <label>英文名稱<input defaultValue={product?.name} maxLength={120} name="name" required />{fieldError(state, "name")}</label>
          <label>中文名稱<input defaultValue={product?.subtitle} maxLength={120} name="subtitle" required />{fieldError(state, "subtitle")}</label>
          <label>網址代稱<input defaultValue={product?.slug} disabled={product?.status === "published"} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />{product?.status === "published" ? <input name="slug" type="hidden" value={product.slug} /> : null}{fieldError(state, "slug")}</label>
          <label>商品種類<input defaultValue={product?.kind} name="kind" required />{fieldError(state, "kind")}</label>
          <label>
            分類
            <select defaultValue={product?.category ?? categories?.find((item) => item.status === "active")?.code ?? "apparel"} name="category">
              {(categories ?? [
                { code: "apparel", nameZh: "服飾" },
                { code: "accessories", nameZh: "配件" },
                { code: "home", nameZh: "居家生活" },
                { code: "stationery", nameZh: "文具" },
                { code: "tennis", nameZh: "網球" },
              ]).filter((item) => !("status" in item) || item.status === "active" || item.code === product?.category).map((item) => (
                <option key={item.code} value={item.code}>{item.nameZh}</option>
              ))}
            </select>
          </label>
          <label>適用對象<select defaultValue={product?.audience ?? "unisex"} name="audience"><option value="men">男士</option><option value="women">女士</option><option value="unisex">共用</option></select></label>
          <label>
            Estate 篇章
            <select defaultValue={product?.collectionId ?? chapters?.find((item) => item.status === "active")?.code ?? "first-light-in-the-field"} name="collectionId">
              {(chapters ?? [
                { code: "first-light-in-the-field", nameEn: "First Light in the Field" },
                { code: "the-conservatory-hour", nameEn: "The Conservatory Hour" },
                { code: "after-rain-the-library", nameEn: "After Rain, the Library" },
                { code: "dinner-at-the-long-table", nameEn: "Dinner at the Long Table" },
                { code: "the-private-court", nameEn: "The Private Court" },
              ]).filter((item) => !("status" in item) || item.status === "active" || item.code === product?.collectionId).map((item) => (
                <option key={item.code} value={item.code}>{item.nameEn}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="admin-form-help">正式售價不儲存在商品欄位；請於下方各 SKU 新增 append-only 價格版本。</p>
      </fieldset>

      <fieldset>
        <legend>敘事與商品事實</legend>
        <label>商品描述<textarea defaultValue={product?.description} maxLength={1200} name="description" required rows={5} />{fieldError(state, "description")}</label>
        <label>品牌故事<textarea defaultValue={product?.story} maxLength={2000} name="story" required rows={6} />{fieldError(state, "story")}</label>
        <div className="admin-form-grid">
          <label>尺寸說明<textarea defaultValue={product?.sizing} maxLength={1000} name="sizing" required rows={5} /></label>
          <label>照護方式<textarea defaultValue={product?.care} maxLength={1000} name="care" required rows={5} /></label>
        </div>
        <div className="admin-form-grid">
          <label>
            材質概念代碼
            <textarea
              defaultValue={product?.materialConcepts.join("\n")}
              name="materialConcepts"
              placeholder={"cotton-direction\nleather-direction"}
              rows={5}
            />
            <small>每行或逗號分隔；只記錄已核准 taxonomy 代碼。</small>
            {fieldError(state, "materialConcepts")}
          </label>
          <label>
            相關商品 slug
            <textarea
              defaultValue={product?.relatedProductIds.join("\n")}
              name="relatedProductIds"
              placeholder={"field-house-polo\nbridle-line-belt"}
              rows={5}
            />
            <small>最多 12 件，發布時依順序產生關聯商品。</small>
            {fieldError(state, "relatedProductIds")}
          </label>
        </div>
        <label>
          規格軸 JSON
          <textarea
            defaultValue={JSON.stringify(product?.optionAxes ?? [], null, 2)}
            name="optionAxes"
            placeholder={'[{"key":"size","label":"尺寸","values":[{"value":"m","label":"M"}]}]'}
            rows={9}
          />
          {fieldError(state, "optionAxes")}
        </label>
        <label>
          開站 Gate 代碼
          <textarea
            defaultValue={(product?.launchGateCodes ?? [
              "physical-sample",
              "cost-margin-tax-price",
              "materials-origin-manufacture",
              "measurements-care-safety",
              "inventory-packaging-media",
              "legal-trademark",
            ]).join("\n")}
            name="launchGateCodes"
            required
            rows={6}
          />
          {fieldError(state, "launchGateCodes")}
        </label>
      </fieldset>

      <fieldset>
        <legend>搜尋與分享</legend>
        <label>SEO 標題<input defaultValue={product?.seoTitle} maxLength={120} name="seoTitle" required /></label>
        <label>SEO 描述<textarea defaultValue={product?.seoDescription} maxLength={240} name="seoDescription" required rows={3} /></label>
      </fieldset>

      <div className="admin-form-actions">
        <ActionFeedback state={state} />
        <SubmitButton>{pending ? "儲存中…" : product ? "儲存草稿" : "建立商品草稿"}</SubmitButton>
        {dirty ? <span className="admin-unsaved" role="status">尚有未儲存變更</span> : null}
      </div>
    </form>
  );
}

export function ProductLifecycleActions({
  product,
  canApprove = true,
}: {
  readonly product: AdminProductDraft;
  readonly canApprove?: boolean;
}) {
  const [publishState, publishAction, publishing] = useActionState(publishProductAction, idle);
  const [archiveState, archiveAction, archiving] = useActionState(archiveProductAction, idle);
  const publishKey = useAdminIdempotencyKey(publishState);
  const archiveKey = useAdminIdempotencyKey(archiveState);
  return (
    <div className="admin-lifecycle">
      <form action={publishAction}>
        <input name="id" type="hidden" value={product.id} />
        <input name="expectedVersion" type="hidden" value={product.version} />
        <input name="idempotencyKey" type="hidden" value={`${publishKey}:${product.version}`} />
        <button className="admin-button" disabled={!canApprove || product.status === "archived" || publishing} type="submit">
          {publishing ? "發布中…" : product.status === "published" ? "建立新版發布" : "發布商品"}
        </button>
        <ActionFeedback state={publishState} />
      </form>
      <form action={archiveAction}>
        <input name="id" type="hidden" value={product.id} />
        <input name="expectedVersion" type="hidden" value={product.version} />
        <input name="idempotencyKey" type="hidden" value={`${archiveKey}:${product.version}`} />
        <button className="admin-button admin-button--danger" disabled={!canApprove || product.status === "archived" || archiving} type="submit">
          {archiving ? "封存中…" : "封存商品"}
        </button>
        <ActionFeedback state={archiveState} />
      </form>
      {!canApprove ? <p className="admin-form-help">發布與封存需由 Owner 完成。</p> : null}
    </div>
  );
}

export function InventoryAdjustmentForm({ item }: { readonly item: InventorySummary }) {
  const [state, action, pending] = useActionState(adjustInventoryAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-inline-form">
      <input name="skuId" type="hidden" value={item.skuId} />
      <input name="expectedVersion" type="hidden" value={item.version} />
      <input name="idempotencyKey" type="hidden" value={`${key}:${item.version}`} />
      <label><span className="sr-only">異動原因</span><select aria-label={`${item.skuCode} 異動原因`} name="reason"><option value="receiving">收貨</option><option value="cycle-count">盤點</option><option value="return-inspection">退貨驗收</option><option value="safety-stock">安全庫存調整</option></select></label>
      <label><span className="sr-only">異動數量</span><input aria-label={`${item.skuCode} 異動數量`} inputMode="numeric" name="delta" placeholder="+ / −" required type="number" /></label>
      <button disabled={pending} type="submit">{pending ? "…" : "記錄"}</button>
      <ActionFeedback state={state} />
    </form>
  );
}
