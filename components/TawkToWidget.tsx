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

            // Tawk can re-inject/reposition launcher elements after load/open/close.
            // Keep reapplying styles to known iframe variants.
            const iframe =
              document.querySelector('iframe[title="chat widget"]') ||
              document.querySelector('iframe[src*="tawk"]');
            const iframes = [
              iframe,
              document.querySelector('[id*="tawk"] iframe'),
              document.querySelector('[class*="tawk"] iframe'),
            ].filter(Boolean);

            if (!iframes.length) return;

            iframes.forEach(function (el) {
              const node = el;
              if (!isMobile) {
                // Reset overrides on larger screens
                node.style.removeProperty("bottom");
                node.style.removeProperty("right");
                return;
              }

              // Keep chat above mobile bottom nav/cart + iOS safe area
              node.style.setProperty(
                "bottom",
                "calc(env(safe-area-inset-bottom, 0px) + 150px)",
                "important"
              );
              node.style.setProperty("right", "12px", "important");
              node.style.setProperty("z-index", "2147483647", "important");
            });
          }

          // Run immediately and keep correcting while Tawk mutates DOM.
          moveWidget();
          const interval = setInterval(moveWidget, 1000);
          const observer = new MutationObserver(moveWidget);
          observer.observe(document.body, { childList: true, subtree: true });

          // Stop after some time (performance safe) while still covering delayed widget shifts.
          setTimeout(() => {
            clearInterval(interval);
            observer.disconnect();
          }, 30000);

          // Re-run on viewport changes
          window.addEventListener("resize", moveWidget);
          window.addEventListener("orientationchange", moveWidget);

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
