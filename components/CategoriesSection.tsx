import Image from "next/image"
import Link from "next/link"
import { getFeaturedCategories } from "@/lib/api"
export default async function CategoriesSection() {
  const data = await getFeaturedCategories()
  const updates = data?.acf?.featured_category

  if (!updates || updates.length === 0) return null

  return (
    <section className="mb-10 marketing-section">
    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-4 md:gap-6 mx-auto containe">
      {updates.map((item: any, index: number) => (
        <Link
          key={index}
          href={item.category_link?.url || "#"}
          target={item.category_link?.target || "_self"}
        >
          <Image
            src={item.category_image?.url}
            alt={item.category_image?.alt || "Featured Category"}
            className="w-full h-full object-cover rounded-lg"
            width={600}
            height={400}
          />
        </Link>
      ))}
    </div>
    </section>
  )
}