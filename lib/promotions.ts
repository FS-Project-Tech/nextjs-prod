export async function fetchGlobalPromotions() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_WP_URL}/wp-json/acf/v3/options/options`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data?.acf?.promotional_section || [];
}
