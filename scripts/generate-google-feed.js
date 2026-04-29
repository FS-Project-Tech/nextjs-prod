import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";

const PER_PAGE = 100;
const OUTPUT_DIR = path.join(process.cwd(), "public/google-feed");

function stripHtml(html) {
  return html
    ?.replace(/<[^>]*>?/gm, "")
    ?.replace(/\s+/g, " ")
    ?.trim();
}

function xmlSafe(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchProducts(page) {
  const baseUrl = process.env.NEXT_PUBLIC_WP_URL?.replace(/\/+$/, "");
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;

  const url = `${baseUrl}/wp-json/wc/v3/products?per_page=${PER_PAGE}&page=${page}`;
  const auth = `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;

  const res = await fetch(url, {
    headers: { Authorization: auth },
  });

  if (!res.ok) {
    console.error("WooCommerce API error", res.status);
    return [];
  }

  return res.json();
}

function buildXML(products) {
  return `
    ${products
      .map(
        (p) => `
        <item>
          <g:id>${p.id}</g:id>
          <g:title><![CDATA[${xmlSafe(p.name)}]]></g:title>
          <g:description><![CDATA[${xmlSafe(stripHtml(p.description))}]]></g:description>
          ${p.parent_id !== 0 ? `<g:item_group_id>${p.group_id}</g:item_group_id></g:mpn>` : ""}
          <g:link>${process.env.NEXT_PUBLIC_SITE_FEED_URL}/product/${p.slug}</g:link>
          <g:product_type>${xmlSafe(p.categories?.[0]?.name)}</g:product_type>
          <g:google_product_category>${xmlSafe("Business & Industrial > Medical > Medical Supplies")}</g:google_product_category>
          <g:image_link>${p.images?.[0]?.src}</g:image_link>
          <g:condition>new</g:condition>
          <g:availability>${p.stock_status}</g:availability>
          <g:price>${p.price} AUD</g:price>
          <g:brand>${xmlSafe(p.brands?.[0]?.name)}</g:brand>
          <g:identifier_exists>yes</g:identifier_exists>
          <g:gtin></g:gtin>
        </item>
    `
      )
      .join("")}`;
}

async function generate() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let page = 1;

  let xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
<title>
<![CDATA[ Joya Medical Supplies ]]>
</title>
<link><![CDATA[ https://wordpress-1513595-6318973.cloudwaysapps.com ]]></link>
<description><![CDATA[ CTX Feed - This product feed is generated with the CTX Feed - WooCommerce Product Feed Manager plugin by WebAppick.com. For all your support questions check out our plugin Docs on https://webappick.com/docs or e-mail to: support@webappick.com ]]></description>`;

  while (true) {
    console.log("Fetching page:", page);

    const products = await fetchProducts(page);

    if (!products.length) break;

    xml = xml + buildXML(products);

    page++;
  }

  xml = xml + `</channel></rss>`;


  fs.writeFileSync(
    path.join(OUTPUT_DIR, `feed.xml`),
    xml
  );

  // const files = fs
  // .readdirSync(OUTPUT_DIR)
  // .filter(f => f.startsWith("products-") && f.endsWith(".xml"));

  // const indexXML = `<?xml version="1.0"?>
  // <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  // ${files.map(f => `
  // <sitemap>
  // <loc>${process.env.NEXT_PUBLIC_SITE_URL}/google-feed/${f}</loc>
  // </sitemap>
  // `).join("")}
  // </sitemapindex>
  // `;

  // fs.writeFileSync(
  //   path.join(OUTPUT_DIR, "feed.xml"),
  //   indexXML
  // );
  // console.log("Feed generated");
}

generate();