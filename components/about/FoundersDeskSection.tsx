import Image from "next/image";

export default function FoundersDeskSection() {
  // Replace with actual founder image
  const founderImage = process.env.NEXT_PUBLIC_FOUNDER_IMAGE_URL || 
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop";

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center max-w-7xl mx-auto">
          {/* Left: Founder Image */}
          <div className="order-2 lg:order-1">
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden shadow-xl">
              <Image
                src={founderImage}
                alt="Founder"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>

          {/* Right: About Us Content */}
          <div className="order-1 lg:order-2">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-3xl lg:text-3xl font-bold text-gray-900 mb-4">
                From the Founder&apos;s Desk
              </h2>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p className="text-lg">
                  Here at Joya Medical Supplies, we are a trusted and reliable supplier of a wide range of 
                  medical products to professionals and the general public. We are proud to be an Australian 
                  family-owned and operated company. Our comprehensive inventory allows you to choose from a 
                  huge range and presents you with the most suitable medical supplies at modest rates.
                </p>
                <p>
                  Not only that, but we also provide a store pick-up option, and with that motive, Joya 
                  Medical Supplies wanted to give our customers the freedom of availability.
                </p>
                <p>
                  We want to stay in touch with our customers and make them believe that we are always here 
                  for them. That&apos;s why whenever you ring us, you won&apos;t hear an automated voice but our 
                  experts helping you.
                </p>
                <p className="font-medium text-gray-900">
                  We aim to fulfil your medical needs by providing the right consumables to you at the right 
                  time. With more than 7,000 products in stock right now, we aim to be your one-stop-shop 
                  solution for your medical requirements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

