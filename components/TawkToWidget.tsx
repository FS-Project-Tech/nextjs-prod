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
        /** Lift floating button above mobile bottom nav (icons + labels + safe area). Tailwind lg = 1024px. */
        Tawk_API.onLoad = function () {
          try {
            function syncTawkOffset() {
              if (typeof Tawk_API.setWidgetStyle !== "function") return;
              var mobile =
                typeof window.matchMedia !== "undefined" &&
                window.matchMedia("(max-width: 1023px)").matches;
              if (mobile) {
                /** Keep chat clear of bottom-right cart CTA on mobile. */
                Tawk_API.setWidgetStyle({
                  verticalOffset: 132,
                  horizontalOffset: 88,
                  zIndex: 2147483646,
                });
              } else {
                Tawk_API.setWidgetStyle({
                  verticalOffset: 20,
                  horizontalOffset: 20,
                });
              }
            }
            syncTawkOffset();
            setTimeout(syncTawkOffset, 300);
            setTimeout(syncTawkOffset, 1200);
            if (typeof window.matchMedia !== "undefined") {
              window
                .matchMedia("(max-width: 1023px)")
                .addEventListener("change", syncTawkOffset);
            }
          } catch (e) {}
        };
        (function(){
          var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
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
