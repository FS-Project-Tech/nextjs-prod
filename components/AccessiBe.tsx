"use client";

import { useEffect } from "react";

const AccessiBe = () => {
  useEffect(() => {
    const accountId = process.env.NEXT_PUBLIC_ACCESSIBE_KEY?.trim();
    if (!accountId) {
      console.warn("AccessiBe key missing");
      return;
    }

    const existing = document.querySelector(
      'script[src="https://acsbapp.com/apps/app/dist/js/app.js"][data-account]'
    ) as HTMLScriptElement | null;
    if (existing) return;

    const script = document.createElement("script");
    script.id = "accessibe";
    script.src = "https://acsbapp.com/apps/app/dist/js/app.js";
    script.async = true;
    script.setAttribute("data-account", accountId);
    document.body.appendChild(script);
  }, []);

  return null;
};

export default AccessiBe;