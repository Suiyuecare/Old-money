"use client";

import { useRef, useState, type FormEvent } from "react";

import styles from "./orders.module.css";

type RequestState = "idle" | "submitting" | "accepted" | "error";

interface RequestFields {
  readonly publicId: string;
  readonly email: string;
}

const emptyFields: RequestFields = {
  publicId: "",
  email: "",
};

export function OrderAccessRequestForm() {
  const [fields, setFields] = useState(emptyFields);
  const [state, setState] = useState<RequestState>("idle");
  const idempotencyKeyRef = useRef<string | null>(null);

  function updateField(field: keyof RequestFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    // A changed payload must never reuse the command key from a prior payload.
    idempotencyKeyRef.current = null;
    setState("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;

    const idempotencyKey =
      idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    setState("submitting");

    try {
      const response = await fetch("/api/order-access/requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: fields.publicId.trim(),
          email: fields.email.trim(),
          idempotencyKey,
        }),
      });

      if (response.status === 202) {
        // The server has durably accepted this exact command. The next request
        // is a new deliberate operation and receives a fresh key.
        idempotencyKeyRef.current = null;
        setState("accepted");
        return;
      }

      setState("error");
    } catch {
      // Keep the key because a network error cannot prove whether the durable
      // command was accepted. A retry of the same payload is therefore safe.
      setState("error");
    }
  }

  const busy = state === "submitting";

  return (
    <form
      className={styles.requestForm}
      aria-labelledby="order-access-request-title"
      aria-describedby="order-access-request-help"
      aria-busy={busy}
      onSubmit={handleSubmit}
    >
      <div>
        <span className="eyebrow">Secure email link</span>
        <h2 id="order-access-request-title">寄送安全查詢連結</h2>
        <p className="muted" id="order-access-request-help">
          請輸入結帳時使用的 Email。無論資料是否相符，畫面都會顯示相同結果，以保護訂單隱私。
        </p>
      </div>

      <div className={styles.requestFields}>
        <div className="field">
          <label htmlFor="order-public-id">訂單編號</label>
          <input
            id="order-public-id"
            name="publicId"
            value={fields.publicId}
            onChange={(event) =>
              updateField("publicId", event.target.value)
            }
            autoComplete="off"
            inputMode="text"
            placeholder="例如 LIG-20260727-1001"
            pattern="[A-Za-z0-9-]{4,40}"
            minLength={4}
            maxLength={40}
            required
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="order-access-email">結帳 Email</label>
          <input
            id="order-access-email"
            name="email"
            value={fields.email}
            onChange={(event) =>
              updateField("email", event.target.value)
            }
            autoComplete="email"
            inputMode="email"
            type="email"
            maxLength={254}
            required
            disabled={busy}
          />
        </div>
      </div>

      <div className={styles.requestActions}>
        <button className="button" type="submit" disabled={busy}>
          {busy
            ? "正在送出…"
            : state === "accepted"
              ? "再次寄送安全連結"
              : "寄送安全連結"}
        </button>
        <p
          className={styles.requestStatus}
          role={state === "error" ? "alert" : "status"}
          aria-live={state === "error" ? "assertive" : "polite"}
        >
          {state === "accepted"
            ? "若資料相符，安全連結將寄至該信箱；請同時檢查垃圾郵件。"
            : state === "error"
              ? "目前無法受理安全查詢，請稍後使用相同資料重試。"
              : "連結為短效且只能使用一次；客服人員不會向您索取連結內容。"}
        </p>
      </div>
    </form>
  );
}
