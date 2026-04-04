"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Brand {
  name: string;
  slug: string;
}

export default function BrandFilter({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = searchParams.get("brands") || "";

  const toggleBrand = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (selected === slug) {
      params.delete("brands");
    } else {
      params.set("brands", slug);
    }

    router.push(`/products?${params.toString()}`);
  };

  return (
    <div>
      <h3 className="font-semibold mb-2">Brands</h3>

      <ul className="space-y-2">
        {brands.map((brand) => (
          <li key={brand.slug}>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected === brand.slug}
                onChange={() => toggleBrand(brand.slug)}
              />
              {brand.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
