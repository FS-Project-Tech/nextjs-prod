export type Brand = {
  id: number;
  name: string;
  slug: string;
  count?: number;
  image?: string | null;
  description?: string | null;
};

export async function getBrands(): Promise<Brand[]> {
  const base =
    process.env.NEXT_PUBLIC_WP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${base}/wp-json/custom/v1/brands`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
