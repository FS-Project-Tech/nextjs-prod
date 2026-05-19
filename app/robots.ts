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
          "https://live.joyamedicalsupplies.com.au",
          "https://stage.joyamedicalsupplies.com.au",
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
          "/shop/?s=*",
          "/brands/*?category=*",
          "/brands/*?min_price=*&max_price=*",
          "/brands/*?sortBy=*",
          "/brands/*?product_brand=*",
          "/product-category/*/*?sortBy=*",
          "/product-category/*?min_price=*&max_price=*",
          "/clearance?category=*",
          "/clearance?sortBy=*",
          "/clearance?brands=*",
          "/clearance?min_price=*&max_price=*",
          "/product/*?add_to_wishlist=*",
          "/product/*/?attribute_pa_capacity=*",
          "/product/*/?attribute_pa_thickness-level=*",
          "/product/*/?attribute_pa_size=*",
          "/product/*/?attribute_pa_length=*",
          "/product/*?attribute_pa_colour=*",
          "/product/*/?attribute_pa_drops=*",
          "/product/*/?attribute_pa_flavour=*",
          "/product/*/?attribute_pa_french=*",
          "/product/*/?attribute_pa_weight=*",
          "/product/*/?attribute_pa_absorbency=*",
          "/product/*?attribute_pa_gauge=*",
          "/wp-content/uploads/wp-import-export-lite/",
          "/_next/",
          "/_next/static/*",
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