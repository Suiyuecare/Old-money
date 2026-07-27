"use client";

import { useState } from "react";

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
    readonly derivatives: readonly {
      readonly deliveryPath: string | null;
    }[];
  };
  readonly error?: { readonly message?: string };
}

interface SupportAttachmentListResponse {
  readonly case?: {
    readonly id: string;
    readonly publicId: string;
    readonly state: "open" | "resolved";
    readonly rowVersion: number;
  };
  readonly attachments?: readonly {
    readonly id: string;
    readonly fileName: string;
    readonly contentType: "image/webp";
    readonly byteLength: number;
    readonly width: 1600;
    readonly height: number;
    readonly createdAt: string;
    readonly downloadPath: string;
  }[];
  readonly error?: { readonly message?: string };
}

const supportCaseReferencePattern =
  /^(?:case-[a-f0-9]{20}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`UPLOAD_HTTP_${request.status}`));
    });
    request.addEventListener("error", () => reject(new Error("UPLOAD_NETWORK_FAILED")));
    request.send(file);
  });
}

export function AdminSupportAttachmentUploader() {
  const [entityId, setEntityId] = useState("");
  const [expectedVersion, setExpectedVersion] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<
    NonNullable<SupportAttachmentListResponse["attachments"]>
  >([]);
  const [listPending, setListPending] = useState(false);
  const [listMessage, setListMessage] = useState("");

  async function loadAttachments(reference = entityId.trim()) {
    if (!supportCaseReferencePattern.test(reference)) {
      setListMessage("請輸入有效的客服案件 public ID 或 UUID。");
      setAttachments([]);
      return;
    }
    setListPending(true);
    setListMessage("");
    try {
      const response = await fetch(
        `/api/admin/support/cases/${encodeURIComponent(reference)}/attachments`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { accept: "application/json" },
        },
      );
      const body = await response.json() as SupportAttachmentListResponse;
      if (!response.ok || !body.case || !body.attachments) {
        throw new Error(body.error?.message || "無法讀取客服案件附件。");
      }
      setAttachments(body.attachments);
      setExpectedVersion(body.case.rowVersion);
      setListMessage(
        body.attachments.length > 0
          ? `已載入 ${body.attachments.length} 個私有附件。`
          : "這個案件目前沒有附件。",
      );
    } catch (caught) {
      setAttachments([]);
      setListMessage(
        caught instanceof Error ? caught.message : "無法讀取客服案件附件。",
      );
    } finally {
      setListPending(false);
    }
  }

  async function upload() {
    if (!file || !entityId.trim()) return;
    const accepted = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (!accepted.has(file.type) || file.size > 20 * 1024 * 1024) {
      setMessage("只接受 JPEG、PNG、WebP、AVIF，檔案上限 20MB。");
      return;
    }
    setPending(true);
    setProgress(0);
    setAssetId(null);
    const common = {
      scope: "support" as const,
      entityId: entityId.trim(),
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      expectedVersion,
    };
    try {
      setMessage("正在建立私有客服附件上傳授權…");
      const intentResponse = await fetch("/api/admin/media/upload-intents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...common, idempotencyKey: crypto.randomUUID() }),
      });
      const intentBody = await intentResponse.json() as UploadIntentResponse;
      const intent = intentBody.uploadIntent;
      if (!intentResponse.ok || !intent) {
        throw new Error(intentBody.error?.message || "無法建立上傳授權。");
      }
      if (intent.mode === "demo" || !intent.signedUploadUrl) {
        setMessage("本機 Demo 不儲存客服附件；正式私有 Storage 綁定後才能上傳。");
        return;
      }
      setMessage("正在上傳至私有客服附件 bucket…");
      await uploadWithProgress(intent.signedUploadUrl, file, setProgress);
      setMessage("正在移除 metadata 並建立私有衍生圖…");
      const finalizeResponse = await fetch("/api/admin/media/finalize", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...common,
          idempotencyKey: crypto.randomUUID(),
          intentId: intent.intentId,
          sourcePath: intent.sourcePath,
        }),
      });
      const finalized = await finalizeResponse.json() as FinalizeResponse;
      if (!finalizeResponse.ok || !finalized.media?.mediaAssetId) {
        throw new Error(finalized.error?.message || "客服附件處理未完成。");
      }
      if (finalized.media.derivatives.some((item) => item.deliveryPath !== null)) {
        throw new Error("客服附件被錯誤標記為公開資產，已停止顯示。");
      }
      setAssetId(finalized.media.mediaAssetId);
      setProgress(100);
      setMessage("客服附件已儲存於私有 Storage；不會產生前台公開網址。");
      await loadAttachments(common.entityId);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "客服附件上傳失敗。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="admin-workbench" aria-labelledby="support-attachment-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Private Attachment</span>
          <h2 id="support-attachment-heading">客服案件附件</h2>
          <p>附件只存放於私有 bucket，不建立 `/media/` 公開路徑；目前只接受圖片。</p>
        </div>
      </header>
      <div className="admin-media-uploader">
        <div className="admin-form-grid">
          <label>
            客服案件 ID
            <input
              onBlur={(event) => {
                if (
                  (event.relatedTarget as HTMLElement | null)?.dataset
                    .supportAttachmentLoad === "true"
                ) {
                  return;
                }
                if (supportCaseReferencePattern.test(entityId.trim())) {
                  void loadAttachments();
                }
              }}
              onChange={(event) => {
                setEntityId(event.target.value);
                setAttachments([]);
                setListMessage("");
              }}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              required
              value={entityId}
            />
          </label>
          <label>
            案件版本
            <input
              min={1}
              onChange={(event) => setExpectedVersion(Number(event.target.value))}
              required
              type="number"
              value={expectedVersion}
            />
          </label>
        </div>
        <button
          className="admin-button"
          data-support-attachment-load="true"
          disabled={
            listPending ||
            !supportCaseReferencePattern.test(entityId.trim())
          }
          onClick={() => void loadAttachments()}
          type="button"
        >
          {listPending ? "讀取中…" : "載入案件附件"}
        </button>
        {listMessage ? (
          <p className="admin-form-help" role="status">{listMessage}</p>
        ) : null}
        {attachments.length > 0 ? (
          <ul
            aria-label="客服案件私有附件"
            className="admin-media-transition-list"
          >
            {attachments.map((attachment) => (
              <li className="admin-media-transition" key={attachment.id}>
                <span>
                  {attachment.fileName} · {attachment.width} × {attachment.height}
                  {" · "}{formatBytes(attachment.byteLength)}
                </span>{" "}
                <a
                  className="admin-button"
                  href={attachment.downloadPath}
                >
                  下載
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <label>
          附件圖片
          <input
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={pending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button
          className="admin-button"
          disabled={!file || !entityId.trim() || pending}
          onClick={() => void upload()}
          type="button"
        >
          {pending ? "處理中…" : "上傳私有附件"}
        </button>
        {progress > 0 ? (
          <progress aria-label="客服附件上傳進度" max={100} value={progress}>{progress}%</progress>
        ) : null}
        {message ? <p className="admin-form-help" role="status">{message}</p> : null}
        {assetId ? <p className="admin-feedback" role="status">Media Asset ID：{assetId}</p> : null}
      </div>
    </section>
  );
}
