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
        { name: "sku", type: "string", optional: true },
        { name: "price", type: "float", optional: true },
      
        { name: "description", type: "string", optional: true },
        { name: "short_description", type: "string", optional: true },
      
        { name: "categories", type: "string[]", facet: true },
        { name: "brands", type: "string[]", facet: true },
        { name: "tags", type: "string[]", facet: true },
      
        { name: "variation_skus", type: "string[]", optional: true },
        { name: "variation_names", type: "string[]", optional: true },
      
        { name: "image", type: "string", optional: true },
        { name: "slug", type: "string", optional: true },
      ]
    };

    await client.collections().create(schema);

    console.log("✅ Collection created!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

createCollection();