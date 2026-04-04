import "dotenv/config";

const host = (process.env.NEXT_PUBLIC_TYPESENSE_HOST || "").replace(/^https?:\/\//, "").trim();
const key = (process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || "").trim();
const collection =
  process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION ||
  process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME ||
  process.env.TYPESENSE_COLLECTION ||
  "products";

const url = `https://${host}/collections/${collection}`;
const res = await fetch(url, {
  headers: { "X-TYPESENSE-API-KEY": key },
});
const j = await res.json();
if (!res.ok) {
  console.error(j);
  process.exit(1);
}
console.log("collection:", collection);
for (const f of j.fields || []) {
  console.log(`${f.name}\t${f.type}${f.facet ? "\tfacet" : ""}`);
}
