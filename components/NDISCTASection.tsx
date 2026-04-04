import Link from "next/link";
import Image from "next/image";

export default function NDISCTASection() {
  // Placeholder image - replace with your actual NDIS image
  const ndisImage =
    process.env.NEXT_PUBLIC_NDIS_IMAGE_URL ||
    "https://images.unsplash.com/photo-1543269664-7eef42226a21?w=800&h=600&fit=crop";

  return (
    <section id="ndis" className="mb-16">
      <div className="mx-auto container" suppressHydrationWarning>
        <div
          className="rounded-2xl overflow-hidden bg-gradient-to-r from-teal-50 to-blue-50 shadow-xl"
          suppressHydrationWarning
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0" suppressHydrationWarning>
            {/* Left Side - Image */}
            <div className="relative h-64 lg:h-auto min-h-[400px]" suppressHydrationWarning>
              <Image
                src={ndisImage}
                alt="NDIS participant enjoying independence in garden"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-r from-teal-900/20 to-transparent lg:hidden" />
            </div>

            {/* Right Side - NDIS Information */}
            <div
              className="flex flex-col justify-center p-8 lg:p-12 bg-white lg:bg-transparent"
              suppressHydrationWarning
            >
              <div className="mb-4" suppressHydrationWarning>
                <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">What is NDIS?</h2>
                <div className="space-y-4 text-gray-700">
                  <p className="text-lg leading-relaxed">
                    <strong className="text-ndis">NDIS</strong> stands for the{" "}
                    <strong className="text-ndis">National Disability Insurance Scheme</strong>.
                  </p>
                  <p className="text-base leading-relaxed">
                    The NDIS is Australia's national scheme for supporting people with permanent and
                    significant disability. It provides funding directly to individuals to access
                    the supports and services they need to live their best life and achieve their
                    goals.
                  </p>
                  <p className="text-base leading-relaxed">
                    We are proud to support NDIS participants by providing high-quality medical
                    supplies, continence care products, and healthcare essentials that can be
                    purchased using your NDIS funding.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  href="/ndis"
                  className="inline-flex items-center justify-center rounded-lg bg-ndis px-8 py-4 text-base font-semibold text-white hover:bg-teal-700 transition-colors shadow-lg hover:shadow-xl"
                >
                  Read More
                  <svg
                    className="ml-2 w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>

              {/* Optional: NDIS Logo or Badge */}
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-5 h-5 text-ndis" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>NDIS Approved Provider</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
