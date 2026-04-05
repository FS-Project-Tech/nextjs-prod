import localFont from "next/font/local";

/**
 * Grift (brand). Files live in `/public/fonts` as WOFF2.
 *
 * **Placeholders:** If you used the repo setup script, the current files may be
 * Latin Inter metrics under these filenames — replace with your licensed Grift
 * `.woff2` files for correct branding (see `public/fonts/README.md`).
 */
export const grift = localFont({
  src: [
    {
      path: "../public/fonts/Grift-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/Grift-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/Grift-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/Grift-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-grift",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
});
