"use client";

import {
  InstantSearch,
  SearchBox,
  Hits,
  RefinementList,
  Pagination,
  SortBy,
  useSearchBox
} from "react-instantsearch";
import { searchClient } from "@/lib/typesense";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import ProductCard from "@/components/ProductCard";

// ✅ Sync query with URL
function SyncQuery({ query }) {
  const { refine } = useSearchBox();

  useEffect(() => {
    refine(query);
  }, [query]);

  return null;
}

// ✅ Map Typesense → Your ProductCard
function HitProductCard({ hit }) {
  
  return (
    <ProductCard
      id={Number(hit.id)}
      slug={hit.slug}
      name={hit.name}
      sku={Array.isArray(hit.sku) ? hit.sku[0] : hit.sku}
      price={String(hit.price)}
      sale_price={hit.sale_price ? String(hit.sale_price) : undefined}
      regular_price={hit.regular_price ? String(hit.regular_price) : undefined}
      on_sale={hit.sale_price && hit.regular_price ? true : false}
      imageUrl={hit.image}
      imageAlt={hit.name}
    />
  );
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  return (
    <InstantSearch searchClient={searchClient} indexName="products">
      
      <SyncQuery query={query} />

      <div className="flex gap-6 p-6">

        {/* 🔥 LEFT SIDEBAR (Filters like category page) */}
        <div className="w-64 space-y-6">

        {/* <SearchBox
              defaultValue={query}
              classNames={{
                input: "border p-2 rounded w-80"
              }}
            /> */}

           {/* Category */}
          <div className="bg-white rounded-lg  p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Category</h3>

            <RefinementList
              attribute="category"
              classNames={{
                list: "space-y-2",
                item: "flex items-center justify-between text-sm cursor-pointer",
                label: "flex items-center gap-2 cursor-pointer",
                checkbox: "accent-teal-600 w-4 h-4",
                count: "text-gray-400 text-xs"
              }}
            />
          </div>


          {/* Brand */}
          <div className="bg-white rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Brand</h3>

            <RefinementList
              attribute="brand"
              classNames={{
                list: "space-y-2",
                item: "flex items-center justify-between text-sm",
                label: "flex items-center gap-2",
                checkbox: "accent-teal-600 w-4 h-4",
                count: "text-gray-400 text-xs"
              }}
            />
          </div>

        </div>

        {/* 🔥 MAIN CONTENT */}
        <div className="flex-1">

          {/* Top bar */}
          <div className="flex justify-end items-center mb-4">

            {/* 🔥 Sorting */}
            <SortBy
              items={[
                { label: "Default", value: "products" },
                { label: "Price Low → High", value: "products/sort/price:asc" },
                { label: "Price High → Low", value: "products/sort/price:desc" }
              ]}
              classNames={{
                select: "border p-2 rounded"
              }}
            />
          </div>

          {/* 🔥 Product Grid */}
          <Hits
            hitComponent={HitProductCard}
            classNames={{
              list: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            }}
          />

          {/* 🔥 Pagination */}
          {/* <div className="mt-6 flex justify-center">
            <Pagination />
          </div> */}

        </div>
      </div>
    </InstantSearch>
  );
}