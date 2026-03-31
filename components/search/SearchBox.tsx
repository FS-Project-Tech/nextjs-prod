// components/search/SearchBox.tsx
"use client";

import { SearchBox as AlgoliaSearchBox } from "react-instantsearch";

export default function SearchBox() {
  return (
    <div className="mb-4">
      <AlgoliaSearchBox
        classNames={{
          input: "w-full p-3 border rounded-lg",
        }}
        placeholder="Search products..."
      />
    </div>
  );
}