import PrefetchLink from "@/components/PrefetchLink";
import Image from "next/image";

const currentYear = new Date().getFullYear();

async function fetchHeaderData() {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_WP_URL ||
      process.env.WP_URL;

    if (!baseUrl) return null;

    const res = await fetch(
      `${baseUrl}/wp-json/acf/v3/options/options`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return null;

    const data = await res.json();

    return {
      footerLogo: data?.acf?.footer_logo || data?.acf?.logo,
      siteName: data?.acf?.site_name,
    };
  } catch {
    return null;
  }
}

export default async function Footer() {
  const headerData = await fetchHeaderData();

  const logoUrl =
    headerData?.footerLogo ||
    process.env.NEXT_PUBLIC_FOOTER_LOGO ||
    "/fallback-logo.png";

  const siteName =
    headerData?.siteName || "WooCommerce Store";

  return (
    <footer
      className="text-white border-t border-teal-600 rounded-t-2xl md:rounded-t-3xl"
      style={{ backgroundColor: "#1f605f" }}
    >
      <div className="container mx-auto w-full box-border px-4 py-7 sm:px-6 sm:py-9 md:px-8 md:py-10 lg:px-10 lg:py-16">
        <div className="grid grid-cols-1 gap-7 sm:gap-8 md:grid-cols-2 md:gap-8 lg:grid-cols-4 lg:gap-12 mb-7 sm:mb-9 lg:mb-12">

          {/* Column 1: Logo */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center max-w-[200px] sm:max-w-xs md:max-w-full">
              {logoUrl ? (
                <div className="relative w-full">
                  <Image
                    src={logoUrl}
                    alt={siteName || "Logo"}
                    width={800}
                    height={200}
                    className="w-full h-auto max-h-12 sm:max-h-14 md:max-w-full object-contain object-left"
                  />
                </div>
              ) : (
                <div className="h-12 w-12 rounded bg-white/20 text-white grid place-items-center text-xl font-bold">
                  Joya
                </div>
              )}
            </div>

            <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
              Your trusted partner for quality medical supplies and healthcare products.
              Supporting NDIS participants with premium care solutions.
            </p>

            <a
              href="https://calendly.com/joyamedicalsupplies-info/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-white text-teal transition-all duration-200 rounded-xl shadow-md hover:shadow-lg"
            >
              Request a Call
            </a>
          </div>

          {/* Column 2: Menu */}
          <div>
            <h3 className="text-white font-semibold text-base sm:text-lg mb-3 sm:mb-4">Menu</h3>
            <ul className="space-y-1.5 sm:space-y-2.5 text-sm">
              <li><PrefetchLink href="/" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Home</PrefetchLink></li>
              <li><PrefetchLink href="/shop" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Shop</PrefetchLink></li>
              <li><PrefetchLink href="/catalogue" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Catalogue</PrefetchLink></li>
              <li><PrefetchLink href="/cart" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Cart</PrefetchLink></li>
              <li><PrefetchLink href="/dashboard/wishlist" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Wishlist</PrefetchLink></li>
              <li><PrefetchLink href="/account" critical className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">My Account</PrefetchLink></li>
              <li><PrefetchLink href="/blog" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Blog</PrefetchLink></li>
              <li>
                <a
                  href="/pdf/Return-Form-new-2025.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10"
                >
                  Product Return
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Quick Links */}
          <div>
            <h3 className="text-white font-semibold text-base sm:text-lg mb-3 sm:mb-4">Quick Links</h3>
            <ul className="space-y-1.5 sm:space-y-2.5 text-sm">
              <li><PrefetchLink href="/about" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">About Us</PrefetchLink></li>
              <li><PrefetchLink href="/resources" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Resources</PrefetchLink></li>
              <li><PrefetchLink href="/shipping" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Shipping & Returns</PrefetchLink></li>
              <li><PrefetchLink href="/collection-statement" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Collection Statement</PrefetchLink></li>
              <li><PrefetchLink href="/faq" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">FAQ</PrefetchLink></li>
              <li><PrefetchLink href="/events" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Events</PrefetchLink></li>
              <li><PrefetchLink href="/request-for-catalogue" className="inline-flex rounded-md px-1.5 py-1 text-white/85 hover:text-white hover:bg-white/10">Request for Catalogue</PrefetchLink></li>
            </ul>
          </div>

          {/* Column 4 unchanged */}
          <div>
  <h3 className="text-white font-semibold text-base sm:text-lg mb-3 sm:mb-4">
    Location
  </h3>

  <div className="space-y-2 sm:space-y-2.5 text-xs sm:text-sm text-white/90">

    {/* Address */}
    <div className="flex items-start gap-2.5">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p className="flex-1">6/7 Hansen Court, Coomera, 4209, QLD</p>
    </div>

    {/* Phone Numbers */}
    {[
      "1300005032",
      "0755646628",
      "0430393124"
    ].map((phone, i) => (
      <a
        key={phone}
        href={`tel:${phone}`}
        className="flex items-center gap-2.5 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {i === 2 ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          )}
        </svg>

        <span>
          {phone === "1300005032" && "1300 005 032"}
          {phone === "0755646628" && "07 5564 6628"}
          {phone === "0430393124" && "0430 393 124"}
        </span>
      </a>
    ))}

    {/* Email */}
    <a
      href="mailto:info@joyamedicalsupplies.com.au"
      className="flex items-center gap-2.5 hover:text-white transition-colors break-all"
    >
      <svg className="w-4 h-4 shrink-0 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <span>info@joyamedicalsupplies.com.au</span>
    </a>

  </div>
</div>

        </div>

        <div className="border-t border-white/20 pt-5 sm:pt-7">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-4 text-center md:text-left">
            <p className="text-xs sm:text-sm text-white/90 order-2 md:order-1">
              © {currentYear} Joya Medical Supplies. All rights reserved.
            </p>

            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-white/90 order-1 md:order-2">
              <PrefetchLink href="/privacy" className="hover:text-white">Privacy Policy</PrefetchLink>
              <PrefetchLink href="/terms" className="hover:text-white">Terms & Conditions</PrefetchLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}