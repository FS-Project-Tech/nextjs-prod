"use client";

import Script from "next/script";

/**
 * Tawk.to live chat widget
 * Loads via script - no npm package (avoids React 19 peer dependency conflict)
 */
export default function TawkToWidget() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID || "";
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || "";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  if (!propertyId || !widgetId) return null;

  return (
    <Script id="tawk-to" strategy="lazyOnload">
      {`
  var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();

  Tawk_API.onLoad = function () {
    try {
      function applyMobileFix() {
        var isMobile =
          typeof window.matchMedia !== "undefined" &&
          window.matchMedia("(max-width: 1023px)").matches;

        if (!isMobile) return;

        // 1️⃣ Tawk API positioning (fallback)
        if (typeof Tawk_API.setWidgetStyle === "function") {
          Tawk_API.setWidgetStyle({
            verticalOffset: 150,
            horizontalOffset: 90,
            zIndex: 2147483646,
          });
        }

        // 2️⃣ Inject CSS dynamically (NO global.css needed)
        if (!document.getElementById("tawk-mobile-fix")) {
          var style = document.createElement("style");
          style.id = "tawk-mobile-fix";
          style.innerHTML = \`
            @media (max-width: 1023px) {
              iframe[src*="tawk.to"] {
                bottom: 150px !important;
                right: 90px !important;
              }
            }
          \`;
          document.head.appendChild(style);
        }
      }

      // Run multiple times (important for async iframe)
      applyMobileFix();
      setTimeout(applyMobileFix, 500);
      setTimeout(applyMobileFix, 1500);
      setTimeout(applyMobileFix, 3000);

      // Re-apply on screen change
      if (typeof window.matchMedia !== "undefined") {
        window
          .matchMedia("(max-width: 1023px)")
          .addEventListener("change", applyMobileFix);
      }

    } catch (e) {}
  };

  (function(){
    var s1=document.createElement("script"),
        s0=document.getElementsByTagName("script")[0];
    s1.async=true;
    s1.src='https://embed.tawk.to/${propertyId}/${widgetId}?nonce=${nonce}';
    s1.charset='UTF-8';
    s1.setAttribute('crossorigin','*');
    s0.parentNode.insertBefore(s1,s0);
  })();
`}
    </Script>
  );
}
