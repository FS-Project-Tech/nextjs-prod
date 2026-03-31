"use client";

import { InstantSearch, SearchBox, Hits } from "react-instantsearch";     
import { searchClient } from "@/lib/typesense";
import router from "next/router";

function Hit({ hit }) {
  return (
    <div className="flex gap-2 p-2 hover:bg-gray-100">
      <img src={hit.image} className="w-10 h-10 object-contain" />
      <div>
        <p className="text-sm">{hit.name}</p>
        <p className="text-xs text-gray-500">{hit.sku}</p>
        <p className="text-sm">${hit.price}</p>
        <p className="text-xs text-gray-500">{hit.category}</p>
        <p className="text-xs text-gray-500">{hit.brand}</p>
      </div>
    </div>
  );
}

export default function HeaderSearch() {
  return (
    <InstantSearch searchClient={searchClient} indexName={process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME}>
      <div className="relative w-full max-w-xl">
        
      <SearchBox
        placeholder="Search products..."
        classNames={{
          input: "w-full border p-2 rounded"
        }}
        onSubmit={(event) => {
          const query = event.target.query.value;

          if (query) {
            router.push(`/search?q=${encodeURIComponent(query)}`);
          }
        }}
      />

        <div className="absolute w-full bg-white shadow mt-1 z-50 max-h-80 overflow-auto">
          <Hits hitComponent={Hit} />
        </div>

      </div>
    </InstantSearch>
  );
}