/**
 * Creates the Typesense `products` collection (admin API key required).
 *
 * Loads repo-root `.env` automatically (same vars as Next.js).
 *
 * Env (first match wins):
 *   TYPESENSE_HOST or NEXT_PUBLIC_TYPESENSE_HOST
 *   TYPESENSE_API_KEY or NEXT_PUBLIC_TYPESENSE_API_KEY  (admin key to create collections)
 *
 * Run from repo root:
 *   node scripts/create-collection.js
 *
 * If the collection already exists, delete it in the Typesense UI (or API) first, then run again.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Typesense = require("typesense");

const host = (
  process.env.TYPESENSE_HOST ||
  process.env.NEXT_PUBLIC_TYPESENSE_HOST ||
  ""
).trim();
const apiKey = (
  process.env.TYPESENSE_API_KEY ||
  process.env.NEXT_PUBLIC_TYPESENSE_API_KEY ||
  ""
).trim();

if (!host || !apiKey) {
  console.error(
    "Missing Typesense env. Add to repo-root .env, e.g.\n" +
      "  NEXT_PUBLIC_TYPESENSE_HOST=your-cluster.a1.typesense.net\n" +
      "  NEXT_PUBLIC_TYPESENSE_API_KEY=your-key\n" +
      "Or set TYPESENSE_HOST / TYPESENSE_API_KEY. No https:// in the host.",
  );
  process.exit(1);
}

const client = new Typesense.Client({
  nodes: [{ host, port: "443", protocol: "https" }],
  apiKey,
  connectionTimeoutSeconds: 30,
});

async function createCollection() {
  try {
    const schema = {
      name: "products",
      enable_nested_fields: true,
      fields: [
        { name: "id", type: "string" },

        { name: "name", type: "string" },
        { name: "slug", type: "string" },
        { name: "custom_badge", type: "string", facet: true, optional: true },
        /** Parent: multiple SKUs; variation: single SKU — always string[] (see woo-search-api.php). */
        { name: "sku", type: "string[]", optional: true },

        { name: "type", type: "string", facet: true },
        { name: "parent_id", type: "string", facet: true },

        { name: "attributes", type: "object", optional: true },

        { name: "description", type: "string", optional: true },
        { name: "short_description", type: "string", optional: true },
        { name: "variation_dropdown_json", type: "string", optional: true },

        { name: "price", type: "float", facet: true },
        { name: "regular_price", type: "float", optional: true },
        { name: "sale_price", type: "float", optional: true },

        { name: "on_sale", type: "bool", facet: true, optional: true },

        { name: "tax_class", type: "string", optional: true, facet: true },
        { name: "tax_status", type: "string", optional: true, facet: true },
        { name: "gst_free", type: "bool", optional: true, facet: true },

        { name: "category", type: "string[]", facet: true, optional: true },
        { name: "brand", type: "string[]", facet: true, optional: true },
        { name: "tags", type: "string[]", facet: true, optional: true },

        { name: "in_stock", type: "bool", facet: true, optional: true },

        { name: "image", type: "string", optional: true },

        { name: "average_rating", type: "float", optional: true },
        { name: "rating_count", type: "int32", optional: true },
        { name: "popularity", type: "int32", optional: true },
        { name: "date_created", type: "int64", optional: true },

        { name: "updated_at", type: "int64" },
      ],
      default_sorting_field: "updated_at",
    };

    await client.collections().create(schema);

    console.log("✅ Collection `products` created.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    if (err.importResults) console.error(err.importResults);
    process.exitCode = 1;
  }
}

createCollection();