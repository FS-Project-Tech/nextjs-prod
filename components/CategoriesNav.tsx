import PrefetchLink from "@/components/PrefetchLink";
import { getCategoriesForNav } from "@/lib/categories-nav";
import AllCategoriesDrawer from "@/components/AllCategoriesDrawer";
import { ChevronDown } from "lucide-react";

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
    <nav className="bg-nav-header hidden md:block">
      <div className="container mx-auto w-full sm:w-[85vw]">
        <ul className="flex items-center gap-3 text-sm">
          {/* All Categories Drawer */}
          <li>
            <AllCategoriesDrawer className="px-3 py-2 text-white cursor-pointer" />
          </li>

         {/* Our Products */}
         <li>
            <PrefetchLink href="/shop/" className="px-3 py-2 text-white hover:bg-nav-hover">
              Our Products
            </PrefetchLink>
          </li>

         
          

          {/* Brands */}
          
          <li>
            <PrefetchLink href="/brands/" className="px-3 py-2 text-white hover:bg-nav-hover">
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
          <li>
            <PrefetchLink
              href="/ndis/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
              NDIS
            </PrefetchLink>
          </li>

          {/* Funding */}
          <li>
            <PrefetchLink
              href="/funding-scheme/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
              Funding Scheme
            </PrefetchLink>
          </li>

          {/* Nursing */}
          <li className="relative group">
            <PrefetchLink
              href="/nursing"
              className="inline-flex items-center px-3 py-2 text-white hover:bg-nav-hover"
              aria-haspopup={NURSING_SUBMENU.length > 0}
            >
              Nursing
              <ChevronDown
                size={18}
                className="transition-transform duration-200 group-hover:rotate-180"
              />
            </PrefetchLink>
            {NURSING_SUBMENU.length > 0 && (
              <div className="absolute left-0 top-full z-50 hidden w-[260px] rounded-lg border bg-white shadow-xl group-hover:block">
                <ul className="p-3 space-y-1">
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
            )}
          </li>

          {/* B2B */}
          <li>
            <PrefetchLink href="/b2b/" className="px-3 py-2 text-white hover:bg-nav-hover">
              B2B
            </PrefetchLink>
          </li>

          {/* Health Professionals  */}
          <li>
            <PrefetchLink
              href="/health-professionals/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
              Health Professionals
            </PrefetchLink>
          </li>
          <li>
            <PrefetchLink
              href="/telehealth/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
              Telehealth
            </PrefetchLink>
          </li>
           {/* Offers */}
         <li>
            <PrefetchLink href="/clearance/" className="px-3 py-2 text-white hover:bg-nav-hover bg-red-500">
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
