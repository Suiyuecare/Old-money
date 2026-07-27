"use client";

import { useEffect, useState } from "react";

export function OrderAccessClient() {
  const [state, setState] = useState<"checking" | "unavailable">("checking");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      queueMicrotask(() => setState("unavailable"));
      return;
    }
    // Token exchange is deliberately disabled until the hashed-token database
    // command exists. The fragment is still cleared immediately.
    queueMicrotask(() => setState("unavailable"));
  }, []);

  return (
    <div className="notice-card" role="status" aria-live="polite">
      <strong>{state === "checking" ? "正在檢查安全連結" : "安全連結服務尚未啟用"}</strong>
      <p>沒有 token 會留在網址、瀏覽紀錄或分析資料中。</p>
    </div>
  );
}
