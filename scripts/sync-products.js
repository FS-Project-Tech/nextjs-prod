import "dotenv/config";
import { algoliasearch } from "algoliasearch"; // eslint-disable-line 

const client = algoliasearch(
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID,
  process.env.ALGOLIA_ADMIN_KEY
);

const indexName = "live_products";

async function fetchAllProducts() {
  let page = 1;
  let allProducts = [];

  while (true) {
    console.log(`Fetching page ${page}...`);

    const res = await fetch(
      `https://wordpress-1513595-6089575.cloudwaysapps.com/wp-json/wc/v3/products?per_page=100&page=${page}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.WC_CONSUMER_KEY + ":" + process.env.WC_CONSUMER_SECRET
            ).toString("base64"),
        },
      }
    );

    const products = await res.json();

    if (!products.length) break;

    allProducts = allProducts.concat(products);
    page++;
  }

  return allProducts;
}

function extractBrands(product) {
  // 🔥 CASE 1: brand taxonomy (plugin)
  if (product.brands && product.brands.length) {
    return product.brands.map((b) => b.name);
  }

  // 🔥 CASE 2: attribute (pa_brand)
  const brandAttr = product.attributes?.find(
    (attr) => attr.slug === "pa_brand"
  );

  if (brandAttr) {
    return brandAttr.options;
  }

  return [];
}

async function syncProducts() {
  const products = await fetchAllProducts();

  console.log(`Total products fetched: ${products.length}`);

  const records = products.map((p) => {
    const brand = p.taxonomies?.product_brand || [];
    const categories = p.taxonomies?.product_cat || [];
  
    return {
      objectID: p.objectID || p.post_id,
  
      // 🔥 BASIC
      name: p.post_title,
      slug: p.permalink?.split("/product/")[1]?.replace("/", "") || "",
      url: p.permalink,
      sku: p.sku,
  
      // 🔥 TAXONOMIES
      brand, // ["M Devices"]
      category: categories, // ["Uncategorized"]
  
      // 🔥 HIERARCHY (VERY IMPORTANT)
      "category.lvl0": categories[0] || "",
  
      // 🔥 PRICING
      price: Number(p.price || 0),
      regular_price: Number(p.regular_price || 0),
      sale_price: Number(p.sale_price || 0),
  
      // 🔥 IMAGE
      image: p.images?.thumbnail?.url || "",
  
      // 🔥 CONTENT
      description: p.content,
      short_description: p.post_excerpt,
  
      // 🔥 STOCK (fallback logic)
      inStock: Number(p.variations_count || 0) > 0,
  
      // 🔥 SEARCH BOOST FIELDS
      post_type: p.post_type,
    };
  });

  await client.saveObjects({
    indexName,
    objects: records,
  });

  console.log("✅ All products synced to Algolia with taxonomies");
}

syncProducts();