import { MetadataRoute } from "next";
import { getSitemapBaseUrl } from "@/lib/cms-seo";

const siteUrl = getSitemapBaseUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        crawlDelay: 30,
        allow: "/",
        disallow: [
          "/wp-admin/",
          "/api/",
          "/cart/",
          "/checkout/",
          "/login/",
          "/register",
          "/forgot/",
          "/*.pdf",
          "/dashboard/",
          "/search?q=*",
          "/*?sortBy=*",
          "/feed/",
          "/blog?page=*",
          "/blog?category=*",
          "/product-category/*/*?brands=*",
          "/shop?min_price=*&max_price=*",
          "/shop?sortBy=*",
          "/shop?brands=*",
          "/brands/*?category=*",
          "/brands/*?min_price=*&max_price=*",
          "/brands/*?sortBy=*",
          "/product-category/*/*?sortBy=*",
          "/product-category/*?min_price=*&max_price=*",
          "/clearance?category=*",
          "/clearance?sortBy=*",
          "/clearance?brands=*",
          "/clearance?min_price=*&max_price=*",
          "/wp-content/uploads/wp-import-export-lite/",
          "/_next/",
          "/private/",
        ],
      },

      {
        userAgent: "BLEXBot",
        disallow: ["/?"],
      },

      {
        userAgent: "MJ12Bot",
        disallow: ["/"],
      },

      {
        userAgent: "Storebot-Google",
        allow: "/",
        disallow: ["/login/"],
      },

      {
        userAgent: "AdsBot-Google-Mobile",
        allow: "/",
        disallow: ["/login/"],
      },

      {
        userAgent: "AdsBot-Google",
        allow: "/",
      },
    ],

    sitemap: `${siteUrl}/sitemap.xml`,
  };
}