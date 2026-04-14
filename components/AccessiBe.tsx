"use client";

import Script from "next/script";

const AccessiBe = () => {
  const accountId = process.env.NEXT_PUBLIC_ACCESSIBE_KEY;

  if (!accountId) {
    console.warn("AccessiBe key missing");
    return null;
  }

  return (
    <Script
      id="accessibe"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(){
            var s = document.createElement("script");
            s.setAttribute("data-account", "${accountId}");
            s.src = "https://acsbapp.com/apps/app/dist/js/app.js";
            s.async = true;
            document.body.appendChild(s);
          })();
        `,
      }}
    />
  );
};

export default AccessiBe;