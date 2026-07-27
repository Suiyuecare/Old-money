"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

import { InviteConfirmationForm } from "./AdminForms";

type InviteState = "checking" | "ready" | "invalid";

function removeSensitiveFragment(): void {
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export function AdminInviteConfirmation({
  publishableKey,
  supabaseUrl,
  tokenHash,
}: {
  readonly publishableKey: string;
  readonly supabaseUrl: string;
  readonly tokenHash: string;
}) {
  const [state, setState] = useState<InviteState>(
    tokenHash ? "ready" : "checking",
  );

  useEffect(() => {
    if (tokenHash) return;

    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.has("error") || fragment.has("error_code")) {
      removeSensitiveFragment();
      queueMicrotask(() => {
        if (active) setState("invalid");
      });
      return () => {
        active = false;
      };
    }

    const client = createBrowserClient(supabaseUrl, publishableKey, {
      isSingleton: false,
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      removeSensitiveFragment();
      setState(!error && data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
    };
  }, [publishableKey, supabaseUrl, tokenHash]);

  if (state === "checking") {
    return (
      <p aria-live="polite" className="admin-feedback" role="status">
        正在安全地驗證邀請連結…
      </p>
    );
  }

  if (state === "invalid") {
    return (
      <p className="admin-feedback" data-status="error" role="alert">
        邀請連結無效或已逾期。請聯絡 Owner 重新邀請。
      </p>
    );
  }

  return <InviteConfirmationForm tokenHash={tokenHash} />;
}
