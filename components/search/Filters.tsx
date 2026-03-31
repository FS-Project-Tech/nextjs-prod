"use client";

import {
  RefinementList,
  RangeInput,
  ToggleRefinement,
} from "react-instantsearch";

export default function FiltersSidebar() {
  return (
    <div className="space-y-6">

      {/* BRAND */}
      <div>
        <h3 className="font-semibold mb-2">Brand</h3>
        <RefinementList attribute="brand" />
      </div>

      {/* CATEGORY (subcategories if exist) */}
      <div>
        <h3 className="font-semibold mb-2">Category</h3>
        <RefinementList attribute="category" />
      </div>

      {/* PRICE */}
      <div>
        <h3 className="font-semibold mb-2">Price</h3>
        <RangeInput attribute="price" />
      </div>

    </div>
  );
}