export async function fetchProductSEO(slug: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_WP_URL}/wp-json/wp/v2/product?slug=${slug}`, {
    next: { revalidate: 300 }, // match your ISR
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data?.[0] || null;
}

// lib/wordpress.ts
export async function fetchCategorySEO(slug: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/wp/v2/product_cat?slug=${slug}`,
    { next: { revalidate: 600 } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data?.[0] || null;
}

/** Fetch brand by slug from WordPress (e.g. /brand/3m/ – plugin may register product_brand or similar). */
export async function fetchBrandBySlug(slug: string) {
  const base = process.env.NEXT_PUBLIC_WP_URL;

  if (!base) return null;

  try {
    const res = await fetch(`${base}/wp-json/custom/v1/brands?slug=${slug}`, {
      next: { revalidate: 3600 },
    });

    const data = await res.json();

    const brand = Array.isArray(data) ? data[0] : null;

    if (!brand) return null;

    return {
      name: brand.name,
      description: brand.description || "",
      image: brand.image || null,
    };
  } catch {
    return null;
  }
}
