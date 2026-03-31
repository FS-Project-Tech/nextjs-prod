/**
 * Resource categories for the Resources hub.
 * Detail content can be fetched from WordPress backend later (by slug or ID).
 */
export const RESOURCE_ITEMS = [
  { title: "Continence Care", slug: "continence-care" },
  { title: "Urinary Care", slug: "urinary-care" },
  { title: "Skin Care", slug: "skin-care" },
  { title: "Nutrition / Feeding", slug: "nutrition-feeding" },
  { title: "Wound Care", slug: "wound-care" },
  { title: "Halyard Gloves", slug: "halyard-gloves" },
  { title: "Halyard Fluid Absorption", slug: "halyard-fluid-absorption" },
  { title: "Halyard Apparel", slug: "halyard-apparel" },
  { title: "Halyard Wipes", slug: "halyard-wipes" },
  { title: "BD PureWick Urine Collection System", slug: "bd-purewick-urine-collection-system" },
  { title: "Feeding Tube", slug: "feeding-tube" },
  { title: "IV Solution", slug: "iv-solution" },
] as const;

export type ResourceSlug = (typeof RESOURCE_ITEMS)[number]["slug"];

export function getResourceBySlug(slug: string) {
  return RESOURCE_ITEMS.find((r) => r.slug === slug);
}
