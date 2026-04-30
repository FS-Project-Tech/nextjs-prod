import PrefetchLink from "@/components/PrefetchLink";
import { getCategoriesForNav } from "@/lib/categories-nav";
import AllCategoriesDrawer from "@/components/AllCategoriesDrawer";
import { ChevronDown } from "lucide-react";

/** Shown from root layout `Suspense` while category tree loads (faster TTFB / streaming). */
export function CategoriesNavSkeleton() {
  return (
    <nav className="bg-nav-header" aria-label="Primary">
      <div className="container w-full overflow-hidden px-2 py-2 sm:px-3">
        <ul className="mx-auto flex min-h-[2.5rem] w-max min-w-full flex-nowrap items-center gap-2 sm:gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <li key={i} className="shrink-0">
              <div className="h-8 w-[4.5rem] animate-pulse rounded bg-white/20 sm:w-24" />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

type Category = {
  id: number;
  name: string;
  slug: string;
  parent: number;
};
 
// const NDIS_SUBMENU = [
//   { name: "About NDIS", slug: "about-ndis" },
//   { name: "How to Apply", slug: "how-to-apply" },
//   { name: "NDIS Products", slug: "ndis-products" },
//   { name: "Eligibility", slug: "eligibility" },
// ];
 
const NURSING_SUBMENU = [
  // { name: "About Nursing", href: "/nursing" },
  { name: "Our Nursing Services", href: "/our-nursing-services" },
];
 
function splitIntoColumns(items: Category[], perColumn = 10) {
  const columns: Category[][] = [];
  for (let i = 0; i < items.length; i += perColumn) {
    columns.push(items.slice(i, i + perColumn));
  }
  return columns;
}
 
async function CategoriesNavContent() {
  let parentCategories: Category[] = [];
  let childCategories: Category[] = [];
 
  try {
    const { parentCategories: parent, childCategories: child } = await getCategoriesForNav();
 
    parentCategories = parent;
    childCategories = child;
  } catch {
    // Keep rendering static nav links even if category API is temporarily unavailable.
    parentCategories = [];
    childCategories = [];
  }
 
  // Build map: parentId → children[]
  const subCategoriesMap = childCategories.reduce<Record<number, Category[]>>((acc, cat) => {
    if (cat.parent) {
      acc[cat.parent] = acc[cat.parent] || [];
      acc[cat.parent].push(cat);
    }
    return acc;
  }, {});
 
  return (
    <nav className="bg-nav-header" aria-label="Primary">
      {/* Single row + horizontal scroll on narrow viewports (touch / trackpad / scrollbar) */}
      {/* overflow-x-auto clips descendants → dropdowns under Nursing were hidden. Allow visible overflow md+ (hover); keep horizontal scroll on small screens only. */}
      <div
        className="w-full container overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.45)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/40 md:overflow-visible"
      >
        <ul className="mx-auto flex w-max min-w-full flex-nowrap items-center gap-1 px-2 text-sm sm:gap-2 sm:px-3 md:gap-3">
          {/* All Categories — desktop only (mobile: Clearance leads the row) */}
          <li className="hidden shrink-0 md:block">
            <AllCategoriesDrawer className="px-2 py-2 text-white cursor-pointer whitespace-nowrap sm:px-3 md:px-3" />
          </li>
 
         {/* Our Products */}
         <li className="shrink-0">
            <PrefetchLink
              href="/shop/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Our Products
            </PrefetchLink>
          </li>
 
         
         
 
          {/* Brands */}
         
          <li className="shrink-0">
            <PrefetchLink
              href="/brands/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Brands
            </PrefetchLink>
          </li>
 
          {/* NDIS */}
          {/* <li className="relative group">
            <PrefetchLink
              href="/ndis/"
              className="inline-flex items-center px-3 py-2 text-white hover:bg-nav-hover"
            >
              NDIS
              <ChevronDown
                size={16}
                className="ml-1 transition-transform duration-200 group-hover:rotate-180"
              />
            </PrefetchLink>
 
            <div className="absolute left-0 top-full z-50 hidden group-hover:block w-[250px] rounded-lg border bg-white shadow-xl">
              <ul className="p-3 space-y-1">
                {NDIS_SUBMENU.map((item) => (
                  <li key={item.slug}>
                    <PrefetchLink
                      href={`/ndis/${item.slug}`}
                      className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      {item.name}
                    </PrefetchLink>
                  </li>
                ))}
              </ul>
            </div>
          </li> */}
         
          {/* NDIS */}
          <li className="shrink-0">
            <PrefetchLink
              href="/ndis/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              NDIS
            </PrefetchLink>
          </li>
 
          {/* Funding */}
          <li className="shrink-0">
            <PrefetchLink
              href="/funding-scheme/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Funding Scheme
            </PrefetchLink>
          </li>
 
          {/* Nursing */}
          <li className="relative shrink-0 group">
            <PrefetchLink
              href="/nursing"
              className="inline-flex items-center whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
              aria-haspopup={NURSING_SUBMENU.length > 0}
            >
              Nursing
              <ChevronDown
                size={18}
                className="transition-transform duration-200 group-hover:rotate-180"
              />
            </PrefetchLink>
            {NURSING_SUBMENU.length > 0 && (
              <div
                className="absolute left-0 top-full z-50 hidden w-[260px] pt-1 group-hover:block group-focus-within:block"
                role="menu"
                aria-label="Nursing links"
              >
                <div className="rounded-lg border bg-white shadow-xl">
                  <ul className="space-y-1 p-3">
                    {NURSING_SUBMENU.map((item) => (
                      <li key={item.href}>
                        <PrefetchLink
                          href={item.href}
                          className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        >
                          {item.name}
                        </PrefetchLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </li>
 
          {/* B2B */}
          <li className="shrink-0">
            <PrefetchLink
              href="/b2b/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              B2B
            </PrefetchLink>
          </li>
 
          {/* Health Professionals  */}
          <li className="shrink-0">
            <PrefetchLink
              href="/health-professionals/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Health Professionals
            </PrefetchLink>
          </li>
          <li className="shrink-0 max-md:pe-2 sm:max-md:pe-3">
            <PrefetchLink
              href="/telehealth/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Telehealth
            </PrefetchLink>
          </li>
          <li className="shrink-0 max-md:pe-2 sm:max-md:pe-3">
            <PrefetchLink
              href="/empower-program/"
              className="block whitespace-nowrap px-2 py-2 text-white hover:bg-nav-hover sm:px-3"
            >
              Empower
            </PrefetchLink>
          </li>
           {/* Offers — first on mobile (replaces All Categories slot); last on md+ */}
         <li className="order-first shrink-0 md:order-last">
            <PrefetchLink
              href="/clearance/"
              className="block whitespace-nowrap bg-red-500 px-2 py-2 text-white hover:bg-nav-hover sm:px-3 md:px-3"
            >
              Clearance
            </PrefetchLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
 
export default async function CategoriesNav() {
  return <CategoriesNavContent />;
}