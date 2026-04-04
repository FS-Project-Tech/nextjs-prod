"use client";

import { useRouter } from "next/navigation";

export default function CategoryTree({ categories }: any) {
  const router = useRouter();

  const safeCategories = Array.isArray(categories) ? categories : [];

  const parentCategories = safeCategories.filter((c) => c.parent === 0);

  const getChildren = (parentId: number) => safeCategories.filter((c) => c.parent === parentId);

  return (
    <div>
      <h3 className="font-semibold mb-2">Categories</h3>

      <ul className="space-y-2">
        {parentCategories.map((parent) => (
          <li key={parent.id}>
            <button
              onClick={() => router.push(`/product-category/${parent.slug}`)}
              className="font-medium text-gray-800 hover:text-teal-600"
            >
              {parent.name}
            </button>

            <ul className="ml-4 mt-1 space-y-1">
              {getChildren(parent.id).map((child) => (
                <li key={child.id}>
                  <button
                    onClick={() => router.push(`/product-category/${child.slug}`)}
                    className="text-sm text-gray-600 hover:text-teal-600"
                  >
                    — {child.name}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
