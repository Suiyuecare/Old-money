"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Do not emit request data. Digest is safe for correlating server logs.
    if (error.digest) console.error(`Admin render failed: ${error.digest}`);
  }, [error.digest]);
  return (
    <div className="admin-main">
      <div className="admin-empty" role="alert">
        <span aria-hidden="true">◇</span>
        <h2>營運資料目前無法讀取</h2>
        <p>正式 RPC 若尚未綁定會安全拒絕讀取。請確認部署與資料庫 binding 後重試。</p>
        <button className="admin-button" onClick={reset} type="button">重新嘗試</button>
      </div>
    </div>
  );
}
