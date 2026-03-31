"use client";

import { useHits, useSearchBox, Highlight } from "react-instantsearch";
import { useRouter } from "next/navigation";

export default function ProductHits() {
  const { hits } = useHits();
  const { query } = useSearchBox();
  const router = useRouter();

  if (!query) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">

      {hits.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">
          No products found for "<span className="font-medium">{query}</span>"
        </div>
      ) : (

        <div className="divide-y">

          {hits.map((item: any) => {

            // 🔥 MAP DATA HERE
            const name = item.post_title;
            const image = item.images?.thumbnail?.url;
            const brand = item.taxonomies?.product_brand?.[0];
            const category = item.taxonomies?.product_cat?.[0];

            const price = Number(item.price || 0);
            const regular = Number(item.regular_price || 0);
            const sale = Number(item.sale_price || 0);


            const slug = item.permalink
            ?.split("/product/")[1]
            ?.replace("/", "");

            const exclGST = regular || price / 1.18;

            return (
              <div
                key={item.objectID}
                onClick={() => router.push(`/product/${slug}`)}
                className="flex gap-3 p-3 hover:bg-gray-50 cursor-pointer"
              >

                {/* IMAGE */}
                <img
                  src={image}
                  alt={name}
                  className="w-12 h-12 object-contain rounded"
                />

                {/* CONTENT */}
                <div className="flex-1 min-w-0">

                  {/* TITLE */}
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-1">
                    {name}
                  </h3>

                  {/* BRAND + SKU */}
                  <div className="text-xs text-gray-500 mt-1">
                    {brand} • SKU: {item.sku}
                  </div>

                  {/* CATEGORY */}
                  <div className="text-xs text-gray-400">
                    {category}
                  </div>

                  {/* PRICE */}
                  <div className="text-sm font-semibold text-teal-600 mt-1">
                    ${price.toFixed(2)}
                    {sale && sale !== regular && (
                      <span className="text-xs text-gray-400 line-through ml-2">
                        ${regular.toFixed(2)}
                      </span>
                    )}
                  </div>

                </div>

              </div>
            );
          })}

        </div>
      )}

      {/* VIEW ALL */}
      <div
        onClick={() => router.push(`/search?q=${query}`)}
        className="p-3 text-center text-sm font-medium text-teal-600 hover:bg-gray-50 cursor-pointer"
      >
        View all results →
      </div>

    </div>
  );
}