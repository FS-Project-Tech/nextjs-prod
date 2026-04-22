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
          function moveWidget() {
            const isMobile =
              typeof window.matchMedia !== "undefined" &&
              window.matchMedia("(max-width: 1023px)").matches;

            // 🔥 IMPORTANT: target correct iframe
            const iframe =
              document.querySelector('iframe[title="chat widget"]') ||
              document.querySelector('iframe[src*="tawk"]');

            if (!iframe) return;

            if (!isMobile) {
              // Reset overrides on larger screens
              iframe.style.removeProperty("bottom");
              iframe.style.removeProperty("right");
              return;
            }

            // Keep chat above mobile bottom nav/cart + iOS safe area
            iframe.style.setProperty(
              "bottom",
              "calc(env(safe-area-inset-bottom, 0px) + 128px)",
              "important"
            );
            iframe.style.setProperty("right", "14px", "important");
            iframe.style.setProperty("z-index", "2147483647", "important");
          }

          // Run multiple times (critical)
          moveWidget();
          const interval = setInterval(moveWidget, 500);

          // Stop after few seconds (performance safe)
          setTimeout(() => clearInterval(interval), 6000);

          // Re-run on resize
          window.addEventListener("resize", moveWidget);

        } catch (e) {
          console.error("Tawk fix error:", e);
        }
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
