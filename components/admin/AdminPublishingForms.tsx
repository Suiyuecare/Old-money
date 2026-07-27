"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  addPriceAction,
  linkMediaAction,
  setReadinessAction,
  transitionMediaAction,
  upsertVariantAction,
} from "@/lib/admin/actions";
import {
  adminMediaStatusLabel,
  listAdminMediaTransitions,
  type AdminMediaTransitionSpec,
} from "@/lib/admin/media-review";
import type {
  AdminActionState,
  AdminMediaLink,
  AdminProductDraft,
  AdminRole,
  AdminVariant,
} from "@/lib/admin/types";

import { ActionFeedback } from "./AdminForms";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

const readinessLabels: Readonly<Record<string, string>> = {
  physical_sample: "實體樣品",
  supplier: "供應商資料",
  cost_margin_tax_price: "成本、毛利、稅與價格",
  materials_origin_manufacture: "材質、產地與製造",
  measurements_capacity_weight: "尺寸、容量與重量",
  care_warning: "照護與警語",
  sku: "SKU 與規格矩陣",
  packaging: "包裝資料",
  sellable_inventory: "可售庫存",
  accurate_photography: "商品圖片正確性",
  shipping_returns: "配送與退貨",
  warranty_care_repair: "保固、保養與維修",
  legal: "法律資料",
  trademark: "商標檢查",
};

function formatTwd(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const taipei = new Date(date.getTime() + 8 * 60 * 60_000);
  return taipei.toISOString().slice(0, 16);
}

function formatTaipeiTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間無效";
  const taipei = new Date(date.getTime() + 8 * 60 * 60_000);
  const [day, time] = taipei.toISOString().split("T");
  return `${day?.replaceAll("-", "/")} ${time?.slice(0, 5)}`;
}

function VariantForm({
  canApprove,
  product,
  variant,
}: {
  readonly canApprove: boolean;
  readonly product: AdminProductDraft;
  readonly variant?: AdminVariant;
}) {
  const [state, action, pending] = useActionState(upsertVariantAction, idle);
  const key = useAdminIdempotencyKey(state);
  const approvalLocked = !canApprove && Boolean(
    variant?.enabled || variant?.factsStatus === "approved",
  );
  const dimensions = variant?.packageDimensionsMm;
  return (
    <form action={action} className="admin-form admin-subform">
      <input name="productId" type="hidden" value={product.id} />
      <input name="expectedVersion" type="hidden" value={product.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${product.version}:${variant?.rowVersion ?? 0}`}
      />
      {variant ? (
        <>
          <input name="variantId" type="hidden" value={variant.id} />
          <input name="expectedVariantVersion" type="hidden" value={variant.rowVersion} />
        </>
      ) : null}
      <div className="admin-form-grid">
        <label>
          Public ID
          <input
            defaultValue={variant?.publicId}
            disabled={Boolean(variant)}
            name="publicId"
            pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
            required
          />
          {variant ? <input name="publicId" type="hidden" value={variant.publicId} /> : null}
        </label>
        <label>
          SKU Code
          <input
            defaultValue={variant?.skuCode}
            disabled={Boolean(variant)}
            name="skuCode"
            pattern="[A-Z0-9-]+"
            placeholder="留白由資料庫產生"
          />
          {variant ? <input name="skuCode" type="hidden" value={variant.skuCode} /> : null}
        </label>
      </div>
      <label>
        規格 JSON
        <textarea
          defaultValue={JSON.stringify(variant?.options ?? { size: "One Size" }, null, 2)}
          name="options"
          required
          rows={4}
        />
        <small>例如：{"{\"size\":\"M\",\"colour\":\"Olive\"}"}</small>
      </label>
      <div className="admin-form-grid admin-form-grid--four">
        <label>重量（g）<input defaultValue={variant?.weightGrams ?? ""} min={1} name="weightGrams" type="number" /></label>
        <label>包裝長（mm）<input defaultValue={dimensions?.length ?? ""} min={1} name="packageLengthMm" type="number" /></label>
        <label>包裝寬（mm）<input defaultValue={dimensions?.width ?? ""} min={1} name="packageWidthMm" type="number" /></label>
        <label>包裝高（mm）<input defaultValue={dimensions?.height ?? ""} min={1} name="packageHeightMm" type="number" /></label>
      </div>
      <div className="admin-form-grid">
        <label>
          商品事實
          <select
            defaultValue={variant?.factsStatus ?? "requires-approval"}
            disabled={!canApprove}
            name="factsStatus"
          >
            <option value="requires-approval">待 Owner 核准</option>
            <option value="approved">已核准</option>
          </select>
          {!canApprove ? (
            <input
              name="factsStatus"
              type="hidden"
              value={variant?.factsStatus ?? "requires-approval"}
            />
          ) : null}
        </label>
        <label className="admin-check-label">
          <input
            defaultChecked={variant?.enabled}
            disabled={!canApprove}
            name="enabled"
            type="checkbox"
          />
          啟用此 SKU
          {!canApprove && variant?.enabled ? <input name="enabled" type="hidden" value="on" /> : null}
        </label>
      </div>
      {approvalLocked ? (
        <p className="admin-form-help">此 SKU 已核准或啟用；後續異動須由 Owner 完成。</p>
      ) : null}
      <div className="admin-subform__actions">
        <ActionFeedback state={state} />
        <button className="admin-button" disabled={pending || approvalLocked} type="submit">
          {pending ? "儲存中…" : variant ? "更新 SKU" : "新增 SKU"}
        </button>
      </div>
    </form>
  );
}

function PriceForm({
  product,
  variant,
}: {
  readonly product: AdminProductDraft;
  readonly variant: AdminVariant;
}) {
  const [state, action, pending] = useActionState(addPriceAction, idle);
  const key = useAdminIdempotencyKey(state);
  const latest = variant.prices[0];
  return (
    <form action={action} className="admin-form admin-subform admin-price-form">
      <input name="productId" type="hidden" value={product.id} />
      <input name="variantId" type="hidden" value={variant.id} />
      <input name="expectedVersion" type="hidden" value={product.version} />
      <input name="expectedVariantVersion" type="hidden" value={variant.rowVersion} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${product.version}:${variant.rowVersion}`}
      />
      <div className="admin-form-grid">
        <label>
          新含稅售價（TWD）
          <input
            defaultValue={latest?.grossTwd ?? (product.basePriceTwd > 0 ? product.basePriceTwd : undefined)}
            min={1}
            name="grossTwd"
            placeholder="例如 26800"
            required
            type="number"
          />
        </label>
        <label>
          價格狀態
          <select defaultValue="sandbox-draft" name="status">
            <option value="sandbox-draft">Sandbox 草稿</option>
            <option value="approved">核准價格</option>
          </select>
        </label>
        <label>
          生效時間
          <input defaultValue={localDateTime(latest?.validFrom ?? null)} name="validFrom" type="datetime-local" />
        </label>
        <label>
          結束時間（選填）
          <input name="validUntil" type="datetime-local" />
        </label>
      </div>
      <p className="admin-form-help">價格採 append-only；送出後會新增版本，不會覆寫歷史。</p>
      <div className="admin-subform__actions">
        <ActionFeedback state={state} />
        <button className="admin-button" disabled={pending} type="submit">
          {pending ? "建立中…" : "新增價格版本"}
        </button>
      </div>
    </form>
  );
}

export function ProductVariantWorkbench({
  canApprove,
  product,
}: {
  readonly canApprove: boolean;
  readonly product: AdminProductDraft;
}) {
  return (
    <section className="admin-workbench" aria-labelledby="variants-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Variants & Prices</span>
          <h2 id="variants-heading">SKU 規格矩陣</h2>
          <p>SKU public ID 與代碼建立後不可更改；核准與啟用需要 Owner 最近十分鐘內的 AAL2。</p>
        </div>
        <span>{product.variants.length} SKU</span>
      </header>
      {product.variants.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">規格</th>
                <th scope="col">狀態</th>
                <th scope="col">目前價格</th>
                <th scope="col">可售</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <tr key={variant.id}>
                  <th scope="row">{variant.skuCode}<small>{variant.publicId}</small></th>
                  <td>{Object.values(variant.options).join(" · ") || "單一規格"}</td>
                  <td>{variant.enabled ? "啟用" : "停用"}<small>{variant.factsStatus === "approved" ? "事實已核准" : "事實待核准"}</small></td>
                  <td>{variant.prices[0] ? formatTwd(variant.prices[0].grossTwd) : "尚無價格"}<small>{variant.prices[0]?.status ?? "—"}</small></td>
                  <td>{variant.inventory?.available ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="admin-workbench__empty">尚未建立 SKU。先建立至少一個規格，才能記錄庫存與價格。</p>}
      <details className="admin-disclosure">
        <summary>新增 SKU</summary>
        <VariantForm canApprove={canApprove} product={product} />
      </details>
      {product.variants.map((variant) => (
        <details className="admin-disclosure" key={variant.id}>
          <summary>編輯 {variant.skuCode}</summary>
          <VariantForm canApprove={canApprove} product={product} variant={variant} />
          {canApprove ? <PriceForm product={product} variant={variant} /> : null}
          {variant.prices.length ? (
            <div className="admin-price-history">
              <h3>價格歷史</h3>
              <ol>
                {variant.prices.map((price) => (
                  <li key={price.id}>
                    <strong>v{price.version} · {formatTwd(price.grossTwd)}</strong>
                    <span>{price.status} · {price.validFrom ? formatTaipeiTimestamp(price.validFrom) : "未排程"}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </details>
      ))}
      <p className="admin-form-help">
        SKU 建立後會出現在 <Link href="/admin/inventory">庫存 movement</Link>；發布前每個啟用 SKU 必須有核准價格與可售庫存。
      </p>
    </section>
  );
}

function ReadinessForm({
  canApprove,
  check,
  product,
}: {
  readonly canApprove: boolean;
  readonly check: AdminProductDraft["readiness"][number];
  readonly product: AdminProductDraft;
}) {
  const [state, action, pending] = useActionState(setReadinessAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-readiness-row">
      <input name="productId" type="hidden" value={product.id} />
      <input name="expectedVersion" type="hidden" value={product.version} />
      <input name="code" type="hidden" value={check.code} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${product.version}:${check.code}:${check.state}`}
      />
      <div>
        <strong>{readinessLabels[check.code] ?? check.code}</strong>
        <small>{check.approvedAt ? `核准於 ${formatTaipeiTimestamp(check.approvedAt)}` : "尚未核准"}</small>
      </div>
      <select defaultValue={check.state} disabled={!canApprove} name="state">
        <option value="pending">待確認</option>
        <option value="passed">通過</option>
        <option value="failed">未通過</option>
      </select>
      <input
        aria-label={`${readinessLabels[check.code] ?? check.code} 證據參照`}
        defaultValue={check.evidenceReference ?? ""}
        disabled={!canApprove}
        name="evidenceReference"
        placeholder="證據參照／內部備註"
      />
      <button disabled={!canApprove || pending} type="submit">{pending ? "…" : "更新"}</button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function ProductReadinessChecklist({
  canApprove,
  product,
}: {
  readonly canApprove: boolean;
  readonly product: AdminProductDraft;
}) {
  const passed = product.readiness.filter((check) => check.state === "passed").length;
  return (
    <section className="admin-workbench" aria-labelledby="readiness-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Publication Gate</span>
          <h2 id="readiness-heading">發布檢查</h2>
          <p>所有項目都通過後才允許建立不可變的 publication snapshot。</p>
        </div>
        <span>{passed} / {product.readiness.length}</span>
      </header>
      <div className="admin-readiness-list">
        {product.readiness.map((check) => (
          <ReadinessForm canApprove={canApprove} check={check} key={check.code} product={product} />
        ))}
      </div>
      {!canApprove ? <p className="admin-form-help">Merchandiser 可準備資料；最終檢查須由 Owner 完成。</p> : null}
    </section>
  );
}

function MediaLinkForm({
  initialAssetId,
  initialPath,
  link,
  product,
}: {
  readonly initialAssetId?: string;
  readonly initialPath?: string;
  readonly link?: AdminMediaLink;
  readonly product: AdminProductDraft;
}) {
  const [state, action, pending] = useActionState(linkMediaAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-form admin-subform">
      <input name="productId" type="hidden" value={product.id} />
      <input name="expectedVersion" type="hidden" value={product.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${product.version}:${link?.rowVersion ?? 0}`}
      />
      {link ? (
        <>
          <input name="linkId" type="hidden" value={link.id} />
          <input name="expectedLinkVersion" type="hidden" value={link.rowVersion} />
        </>
      ) : null}
      <div className="admin-form-grid">
        <label>Media Asset ID<input defaultValue={link?.assetId ?? initialAssetId} name="assetId" required /></label>
        <label>同源公開路徑<input defaultValue={link?.publicPath ?? initialPath} name="publicPath" required /></label>
        <label>
          圖片角色
          <select defaultValue={link?.role ?? "gallery"} name="role">
            <option value="main">主圖</option>
            <option value="detail">細節圖</option>
            <option value="gallery">Gallery</option>
          </select>
        </label>
        <label>排序<input defaultValue={link?.sortOrder ?? product.media.length + 1} min={1} name="sortOrder" required type="number" /></label>
      </div>
      <label>Alt 替代文字<input defaultValue={link?.alt} maxLength={240} name="alt" required /></label>
      <div className="admin-form-grid admin-form-grid--three">
        <label>焦點 X（0–1）<input defaultValue={link?.focalX ?? 0.5} max={1} min={0} name="focalX" required step="0.01" type="number" /></label>
        <label>焦點 Y（0–1）<input defaultValue={link?.focalY ?? 0.5} max={1} min={0} name="focalY" required step="0.01" type="number" /></label>
        <label>畫面中 SKU Public ID<input defaultValue={link?.picturedSkuId ?? ""} name="picturedSkuId" /></label>
      </div>
      <div className="admin-subform__actions">
        <ActionFeedback state={state} />
        <button className="admin-button" disabled={pending} type="submit">
          {pending ? "儲存中…" : link ? "更新圖片資訊" : "連結至商品"}
        </button>
      </div>
    </form>
  );
}

function MediaTransitionFeedback({
  state,
}: {
  readonly state: AdminActionState;
}) {
  const conflict = state.status === "error" && [
    "ROW_VERSION_CONFLICT",
    "VERSION_CONFLICT",
    "INVALID_MEDIA_STATE_TRANSITION",
  ].includes(state.code ?? "");
  if (!conflict) return <ActionFeedback state={state} />;
  return (
    <p className="admin-feedback" data-status="error" role="alert">
      {state.message}
      <small>{state.code}</small>
      <button onClick={() => window.location.reload()} type="button">
        重新載入最新狀態
      </button>
    </p>
  );
}

function MediaTransitionForm({
  link,
  productId,
  transition,
}: {
  readonly link: AdminMediaLink;
  readonly productId: string;
  readonly transition: AdminMediaTransitionSpec;
}) {
  const [state, action, pending] = useActionState(transitionMediaAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-media-transition">
      <input name="productId" type="hidden" value={productId} />
      <input name="assetId" type="hidden" value={link.assetId} />
      <input
        name="expectedAssetVersion"
        type="hidden"
        value={link.assetRowVersion}
      />
      <input name="toStatus" type="hidden" value={transition.toStatus} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${link.assetRowVersion}:${transition.toStatus}`}
      />
      <div>
        <strong>{transition.label}</strong>
        <small>
          {adminMediaStatusLabel(transition.fromStatus)}
          {" → "}
          {adminMediaStatusLabel(transition.toStatus)}
          {transition.requiresRecentAal2 ? " · 需最近 10 分鐘 AAL2" : ""}
        </small>
      </div>
      {transition.requiresBackupAcknowledgement ? (
        <label className="admin-check-label">
          <input name="backupAcknowledged" required type="checkbox" />
          已確認私有原圖與所有衍生圖完成備份
        </label>
      ) : null}
      {transition.requiresReason ? (
        <label>
          操作原因
          <textarea
            maxLength={500}
            minLength={8}
            name="reason"
            placeholder="至少 8 個字元，將寫入稽核紀錄"
            required
            rows={2}
          />
        </label>
      ) : null}
      <div className="admin-subform__actions">
        <MediaTransitionFeedback state={state} />
        <button
          className={`admin-button${transition.destructive ? " admin-button--danger" : ""}`}
          disabled={pending}
          type="submit"
        >
          {pending ? "處理中…" : transition.label}
        </button>
      </div>
    </form>
  );
}

function MediaReviewControls({
  link,
  productId,
  role,
}: {
  readonly link: AdminMediaLink;
  readonly productId: string;
  readonly role: AdminRole;
}) {
  const transitions = listAdminMediaTransitions(link.assetStatus, role);
  if (link.assetRowVersion < 1) {
    return (
      <p className="admin-feedback" data-status="error" role="alert">
        尚未取得媒體資產版本，為避免覆寫他人操作，狀態變更已暫停。請重新載入頁面。
        <small>MEDIA_ASSET_VERSION_REQUIRED</small>
      </p>
    );
  }
  if (transitions.length === 0) {
    return (
      <p className="admin-form-help">
        {link.assetStatus === "revoked"
          ? "此資產已完成撤銷並建立 tombstone；不可直接恢復。"
          : "目前角色沒有可執行的圖片狀態變更。"}
      </p>
    );
  }
  return (
    <section className="admin-media-review" aria-label={`${link.alt} 媒體審核`}>
      <header>
        <div>
          <span className="admin-eyebrow">Asset Review</span>
          <h3>媒體審核</h3>
        </div>
        <span className="admin-media-state" data-state={link.assetStatus}>
          {adminMediaStatusLabel(link.assetStatus)} · v{link.assetRowVersion}
        </span>
      </header>
      <div className="admin-media-transition-list">
        {transitions.map((transition) => (
          <MediaTransitionForm
            key={transition.toStatus}
            link={link}
            productId={productId}
            transition={transition}
          />
        ))}
      </div>
    </section>
  );
}

interface UploadIntentResponse {
  readonly uploadIntent?: {
    readonly mode: "storage" | "demo";
    readonly intentId: string;
    readonly sourcePath: string;
    readonly signedUploadUrl: string | null;
    readonly message: string;
  };
  readonly error?: { readonly message?: string };
}

interface FinalizeResponse {
  readonly media?: {
    readonly mode: "storage" | "demo";
    readonly mediaAssetId: string | null;
    readonly message: string;
    readonly derivatives: readonly {
      readonly width: number;
      readonly format: string;
      readonly deliveryPath: string | null;
    }[];
  };
  readonly error?: { readonly message?: string };
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`UPLOAD_HTTP_${request.status}`));
    });
    request.addEventListener("error", () => reject(new Error("UPLOAD_NETWORK_FAILED")));
    request.send(file);
  });
}

function MediaUploader({ product }: { readonly product: AdminProductDraft }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ readonly assetId: string; readonly publicPath: string } | null>(null);

  async function upload() {
    if (!file) return;
    const accepted = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (!accepted.has(file.type) || file.size > 20 * 1024 * 1024) {
      setMessage("只接受 JPEG、PNG、WebP、AVIF，檔案上限 20MB。");
      return;
    }
    setPending(true);
    setProgress(0);
    setResult(null);
    setMessage("正在建立私有上傳授權…");
    const common = {
      scope: "product" as const,
      entityId: product.id,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      expectedVersion: product.version,
    };
    try {
      const intentResponse = await fetch("/api/admin/media/upload-intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...common, idempotencyKey: crypto.randomUUID() }),
      });
      const intentBody = await intentResponse.json() as UploadIntentResponse;
      const intent = intentBody.uploadIntent;
      if (!intentResponse.ok || !intent) {
        throw new Error(intentBody.error?.message || "無法建立上傳授權。");
      }
      if (intent.mode === "demo" || !intent.signedUploadUrl) {
        setMessage("本機 Demo 不會儲存原圖或建立媒體資產；正式 Storage 綁定後才能上傳。");
        return;
      }
      setMessage("正在上傳至私有 Storage…");
      await uploadWithProgress(intent.signedUploadUrl, file, setProgress);
      setMessage("正在移除 metadata 並產生 800／1200／1600px WebP、AVIF…");
      const finalizeResponse = await fetch("/api/admin/media/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...common,
          idempotencyKey: crypto.randomUUID(),
          intentId: intent.intentId,
          sourcePath: intent.sourcePath,
        }),
      });
      const finalizeBody = await finalizeResponse.json() as FinalizeResponse;
      const media = finalizeBody.media;
      if (!finalizeResponse.ok || !media?.mediaAssetId) {
        throw new Error(finalizeBody.error?.message || "圖片處理未完成。");
      }
      const derivative = media.derivatives.find(
        (item) => item.width === 1200 && item.format === "webp" && item.deliveryPath,
      ) ?? media.derivatives.find((item) => item.deliveryPath);
      if (!derivative?.deliveryPath) throw new Error("找不到可公開的衍生圖。");
      setResult({ assetId: media.mediaAssetId, publicPath: derivative.deliveryPath });
      setProgress(100);
      setMessage("原圖與衍生圖已儲存。請補上圖片資訊並連結至商品。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上傳失敗，請重試。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-media-uploader">
      <label>
        商品原圖
        <input
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={pending}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      <button className="admin-button" disabled={!file || pending} onClick={upload} type="button">
        {pending ? "處理中…" : "上傳並生成衍生圖"}
      </button>
      {progress > 0 ? <progress aria-label="圖片上傳進度" max={100} value={progress}>{progress}%</progress> : null}
      {message ? <p className="admin-form-help" role="status">{message}</p> : null}
      {result ? (
        <MediaLinkForm
          initialAssetId={result.assetId}
          initialPath={result.publicPath}
          product={product}
        />
      ) : null}
    </div>
  );
}

export function ProductMediaWorkbench({
  product,
  role,
}: {
  readonly product: AdminProductDraft;
  readonly role: AdminRole;
}) {
  return (
    <section className="admin-workbench" aria-labelledby="media-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Private Media Pipeline</span>
          <h2 id="media-heading">商品圖片</h2>
          <p>原圖保留於私有 bucket；前台僅使用已處理的同源衍生網址。</p>
        </div>
        <span>{product.media.length} 圖</span>
      </header>
      <p className="admin-feedback" role="status">
        上傳與連結不等於核准。圖片須依序完成草稿、審核與備份確認；只有「已核准上線」的主圖可通過發布檢查。
      </p>
      <MediaUploader product={product} />
      <details className="admin-disclosure">
        <summary>連結既有媒體資產</summary>
        <MediaLinkForm product={product} />
      </details>
      {product.media.map((link) => (
        <details className="admin-disclosure" key={link.id}>
          <summary>
            {link.role === "main" ? "主圖" : link.role === "detail" ? "細節圖" : "Gallery"}
            {" · "}{link.alt}
            {" · "}{adminMediaStatusLabel(link.assetStatus)}
          </summary>
          <MediaLinkForm link={link} product={product} />
          <MediaReviewControls link={link} productId={product.id} role={role} />
        </details>
      ))}
    </section>
  );
}
