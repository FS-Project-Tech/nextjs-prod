export async function getCategoriesTree() {
    const res = await fetch(
      `${process.env.WC_API}/products/categories?per_page=100`,
      { next: { revalidate: 3600 } } // cache 1hr
    );
  
    const data = await res.json();
  
    return buildCategoryTree(data);
  }

  type Category = {
    id: number;
    name: string;
    slug: string;
    parent: number;
  };
  
  export function buildCategoryTree(categories: Category[]) {
    const map = new Map();
    const roots: any[] = [];
  
    // Step 1: map all
    categories.forEach(cat => {
      map.set(cat.id, { ...cat, children: [] });
    });
  
    // Step 2: build tree
    categories.forEach(cat => {
      if (cat.parent === 0) {
        roots.push(map.get(cat.id));
      } else {
        const parent = map.get(cat.parent);
        if (parent) {
          parent.children.push(map.get(cat.id));
        }
      }
    });
  
    return roots;
  }