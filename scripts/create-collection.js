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
      name: "products_updated",
      fields: [
        { name: "id", type: "string" },
    
        { name: "name", type: "string" },
        { name: "slug", type: "string" },
    
        { name: "sku", type: "string[]", optional: true, facet: false },
    
        { name: "description", type: "string", optional: true },
        { name: "short_description", type: "string", optional: true },
    
        // Prices (store ex-tax value if your frontend adds GST)
        { name: "price", type: "float", facet: true },
        { name: "regular_price", type: "float", optional: true },
        { name: "sale_price", type: "float", optional: true },
    
        { name: "on_sale", type: "bool", facet: true, optional: true },
    
        // Tax fields for listing GST logic
        { name: "tax_class", type: "string", optional: true, facet: true },
        { name: "tax_status", type: "string", optional: true, facet: true },
        { name: "gst_free", type: "bool", optional: true, facet: true },
    
        { name: "category", type: "string[]", facet: true, optional: true },
        { name: "brand", type: "string[]", facet: true, optional: true },
        { name: "tags", type: "string[]", facet: true, optional: true },
    
        { name: "in_stock", type: "bool", facet: true, optional: true },
    
        { name: "image", type: "string", optional: true },
    
        // Optional but useful for your existing mapping/sort
        { name: "average_rating", type: "float", optional: true },
        { name: "rating_count", type: "int32", optional: true },
    
        { name: "updated_at", type: "int64" }
      ],
      default_sorting_field: "updated_at"
    };

    await client.collections().create(schema);

    console.log("✅ Collection created!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

createCollection();