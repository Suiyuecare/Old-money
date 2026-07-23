"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Moves keyboard/screen-reader focus after a document or pathname change.
 * Query-only catalog updates do not retrigger this effect, so the active
 * filter or sort control keeps focus.
 */
export function RouteFocusManager() {
  const pathname = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    const initialDocument = firstRun.current;
    firstRun.current = false;

    if (
      initialDocument &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
    ) {
      return;
    }

    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;

    const hadTabIndex = heading.hasAttribute("tabindex");
    if (!hadTabIndex) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });

    if (!hadTabIndex) {
      heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), {
        once: true,
      });
    }
  }, [pathname]);

  return null;
}
