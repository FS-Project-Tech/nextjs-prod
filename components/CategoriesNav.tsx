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

const NDIS_SUBMENU = [
  { name: "About NDIS", slug: "about-ndis" },
  { name: "How to Apply", slug: "how-to-apply" },
  { name: "NDIS Products", slug: "ndis-products" },
  { name: "Eligibility", slug: "eligibility" },
];

const NURSING_SUBMENU = [
  { name: "About Nursing", href: "/nursing" },
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
    const { parentCategories: parent, childCategories: child } =
      await getCategoriesForNav();

    parentCategories = parent;
    childCategories = child;
  } catch {
    return null;
  }

  if (!parentCategories.length) return null;

  // Build map: parentId → children[]
  const subCategoriesMap = childCategories.reduce<Record<number, Category[]>>(
    (acc, cat) => {
      if (cat.parent) {
        acc[cat.parent] = acc[cat.parent] || [];
        acc[cat.parent].push(cat);
      }
      return acc;
    },
    {}
  );

  return (
    <nav className="bg-nav-header hidden md:block">
      <div className="container mx-auto w-full sm:w-[85vw]">
        <ul className="flex items-center gap-3 text-sm">

          {/* All Categories Drawer */}
          <li>
            <AllCategoriesDrawer className="px-3 py-2 text-white" />
          </li>

          {/* Dynamic Categories */}
          {parentCategories.map((category) => {
            const subCategories =
              (subCategoriesMap[category.id] || [])
                .sort((a, b) => a.name.localeCompare(b.name));

            const columns = splitIntoColumns(subCategories, 10);

            return (
              <li key={category.id} className="relative group">

                {/* Parent */}
                <PrefetchLink
                  href={`/product-category/${category.slug}`}
                  className="inline-flex items-center px-3 py-2 text-white hover:bg-nav-hover"
                >
                  {category.name}
                  {subCategories.length > 0 && (
                    <ChevronDown
                      size={16}
                      className="ml-1 transition-transform duration-200 group-hover:rotate-180"
                    />
                  )}
                </PrefetchLink>

                {/* Mega Menu */}
                {subCategories.length > 0 && (
                  <div className="absolute left-0 top-full z-50 hidden group-hover:flex rounded-lg border bg-white shadow-xl p-4 gap-6">

                    {columns.map((col, i) => (
                      <ul key={i} className="space-y-2 min-w-[200px]">
                        {col.map((sub) => (
                          <li key={sub.id}>
                            <PrefetchLink
                              href={`/product-category/${sub.slug}`}
                              className="block rounded-md px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                            >
                              {sub.name}
                            </PrefetchLink>
                          </li>
                        ))}
                      </ul>
                    ))}

                  </div>
                )}
              </li>
            );
          })}

          {/* Brands */}
          <li>
            <PrefetchLink
              href="/brands/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
              Brands
            </PrefetchLink>
          </li>

          {/* NDIS */}
          <li className="relative group">
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
            <PrefetchLink
              href="/b2b/"
              className="px-3 py-2 text-white hover:bg-nav-hover"
            >
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

        </ul>
      </div>
    </nav>
  );
}

export default async function CategoriesNav() {
  return <CategoriesNavContent />;
}