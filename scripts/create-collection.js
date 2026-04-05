import Typesense from "typesense";

const client = new Typesense.Client({
    nodes: [{
      host: "owvh09nzpxs34ilqp-1.a2.typesense.net", // your cloud host
      port: "443",
      protocol: "https"
    }],
    apiKey: "YBxhrmgEXolXvN11Xm3fkDBxLRJH8XyV"
  });

async function createCollection() {
  try {
    const schema = {
      name: "products",
      fields: [
        { name: "id", type: "string" },
        { name: "name", type: "string" },
        { name: "slug", type: "string" },
        { name: "sku", type: "string[]" },
        { name: "description", type: "string", optional: true },
        { name: "price", type: "float" },
        { name: "regular_price", type: "float" },
        { name: "sale_price", type: "float", optional: true },
        { name: "on_sale", type: "bool" },
        { name: "image", type: "string", optional: true },
        { name: "category", type: "string[]", facet: true },
        { name: "brand", type: "string[]", facet: true },
        { name: "tags", type: "string[]", facet: true },
        { name: "in_stock", type: "bool" },
      ],
    };

    await client.collections().create(schema);

    console.log("✅ Collection created!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

createCollection();