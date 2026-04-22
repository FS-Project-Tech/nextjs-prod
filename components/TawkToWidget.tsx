"use client";

import Script from "next/script";

export default function TawkToWidget() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID || "";
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || "";

  if (!propertyId || !widgetId) return null;

  return (
    <Script id="tawk-to" strategy="lazyOnload">
      {`
        var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();

        // ✅ Proper positioning (NO CSS hacks needed)
        Tawk_API.customStyle = {
          visibility: {
            desktop: {
              position: "br",
              xOffset: 20,
              yOffset: 0
            },
            mobile: {
              position: "br",
              xOffset: 12,
              yOffset: 80 // 👈 adjust for your bottom cart/navbar
            }
          }
        };

        // ✅ Optional: handle load
        Tawk_API.onLoad = function () {
          console.log("Tawk loaded");

          // Example: hide on checkout
          if (window.location.pathname.includes("/checkout")) {
            Tawk_API.hideWidget();
          }
        };

        (function(){
          var s1 = document.createElement("script"),
              s0 = document.getElementsByTagName("script")[0];
          s1.async = true;
          s1.src = "https://embed.tawk.to/${propertyId}/${widgetId}";
          s1.charset = "UTF-8";
          s1.setAttribute("crossorigin","*");
          s0.parentNode.insertBefore(s1,s0);
        })();
      `}
    </Script>
  );
}