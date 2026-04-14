"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const TawkToWidget = dynamic(() => import("@/components/TawkToWidget"), { ssr: false });

/**
 * Loads Tawk after the browser is idle (with timeout) so main-thread work and LCP stay prioritized.
 */
export default function DeferredTawkToWidget() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const kick = () => setShow(true);
    let idleId: number | undefined;
    const w = window;
    if ("requestIdleCallback" in w) {
      idleId = w.requestIdleCallback(kick, { timeout: 8000 });
    } else {
      const t = globalThis.setTimeout(kick, 4000);
      return () => globalThis.clearTimeout(t);
    }
    return () => {
      if (idleId != null && "cancelIdleCallback" in w) {
        w.cancelIdleCallback(idleId);
      }
    };
  }, []);

  if (!show) return null;
  return <TawkToWidget />;
}
