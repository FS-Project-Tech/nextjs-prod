"use client";

import { useState } from "react";
import FilterSidebar from "@/components/FilterSidebar";

export default function MobileFilterButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Filters</button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50">
          <div className="bg-white w-full max-w-sm h-full p-4">
            <FilterSidebar isMobileDrawer onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
