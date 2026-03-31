"use client";

import Link from "next/link";
import { getMarketingUpdates } from "@/lib/api"; 


export default async function HomePage() {
  const data = await getMarketingUpdates()

  return (
    <section className="mb-10 marketing-section">
      <div className="mx-auto container">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            Marketing & Updates
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Stay informed about our latest news and special offers
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
          {data.acf.marketing_updates.map((item: any, idx: number) => (
            <div
              key={idx}
              className="rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {item.marketingImage?.node && item.marketingLink && (
                <Link
                  href={item.marketingLink.url}
                  target={item.marketingLink.target || "_self"}
                  className="block mb-4"
                >
                  <img
                    src={item.marketingImage.node.sourceUrl}
                    alt={item.marketingImage.node.altText || ""}
                    className="w-full h-auto object-cover rounded-lg hover:opacity-90 transition-opacity"
                  />
                </Link>
              )}

            </div>
          ))}
        </div>
      </div>
    </section>
)
}
