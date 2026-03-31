import Image from "next/image"
import Link from "next/link"
import { getMarketingUpdates } from "@/lib/api"
import { mapWpToFrontendUrl } from "@/lib/urlMapper"    

export default async function MarketingSection() {
  const data = await getMarketingUpdates()
  const updates = data?.acf?.marketing_updates

  if (!updates || updates.length === 0) return null

  return (
    <section className="mb-10 marketing-section">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
      {updates.map((item: any, index: number) => (
        <Link
          key={index}
          href={mapWpToFrontendUrl(item.marketing_link?.url || "#")}
          target={item.marketing_link?.target || "_self"}
        >
          <Image
            src={item.marketing_image?.url}
            alt={item.marketing_image?.alt || "Marketing"}
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