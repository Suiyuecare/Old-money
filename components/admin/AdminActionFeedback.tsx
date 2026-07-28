"use client";

import type { AdminActionState } from "@/lib/admin/types";

export function ActionFeedback({
  state,
}: {
  readonly state: AdminActionState<unknown>;
}) {
  if (state.status === "idle") return null;
  return (
    <p
      className="admin-feedback"
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
      {state.code ? <small>{state.code}</small> : null}
    </p>
  );
}
