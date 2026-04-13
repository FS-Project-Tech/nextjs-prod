import { getAcfOptions } from "@/lib/wp-acf-options";

export async function fetchGlobalPromotions(): Promise<any[]> {
  const acf = await getAcfOptions();
  if (!acf) return [];
  const section = acf.promotional_section;
  // `acf` is Record<string, unknown>; without a cast this becomes unknown[] and poisons Promise.all inference.
  return Array.isArray(section) ? (section as any[]) : [];
}
