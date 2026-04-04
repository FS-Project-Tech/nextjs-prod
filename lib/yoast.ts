export async function getYoastMeta(url: string) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_WP_URL}/wp-json/yoast/v1/get_head?url=${url}`,
    {
      next: { revalidate: 300 },
    }
  );

  if (!res.ok) return null;

  return res.json();
}
