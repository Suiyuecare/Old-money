"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { AdminActionState } from "@/lib/admin/types";

/**
 * Keep one key for retries of an unresolved command, then rotate only after
 * the server has returned a durable success. This prevents a second, deliberate
 * mutation from replaying the previous command while preserving safe retries
 * after timeouts and errors.
 */
export function useAdminIdempotencyKey(
  actionState: AdminActionState<unknown>,
): string {
  const reactId = useId();
  // The deterministic first value keeps SSR and hydration identical. The
  // first effect rotates it before an interactive form can submit, giving
  // every mount a fresh browser-generated key without random render output.
  const [key, setKey] = useState(
    () => `lignee-admin-command-${reactId}`,
  );
  const previousState = useRef(actionState);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setKey(crypto.randomUUID());
      previousState.current = actionState;
      return;
    }
    if (
      actionState !== previousState.current
      && actionState.status === "success"
    ) {
      setKey(crypto.randomUUID());
    }
    previousState.current = actionState;
  }, [actionState]);

  return key;
}
