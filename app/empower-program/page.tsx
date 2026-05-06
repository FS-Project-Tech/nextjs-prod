import type { Metadata } from "next";
import {
  Headset,
  Lightbulb,
  Pill,
  Percent,
  Sprout,
  Truck,
  Handshake,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import PrefetchLink from "@/components/PrefetchLink";
import ProductCard from "@/components/ProductCard";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { getPublicSiteOrigin } from "@/lib/cms-seo";
import { EMPOWER_TAG_SLUG } from "@/lib/cart/empowerDiscount";
import { wcGet, type WooCommerceProduct } from "@/lib/woocommerce";
import { decodeHTMLEntities } from "@/lib/xss-sanitizer";
import Image from "next/image";

export const dynamic = "force-dynamic";

const WP_SLUG = "empower-program";

/** Microsoft Form — override with NEXT_PUBLIC_EMPOWER_FORM_URL if needed */
const EMPOWER_FORM_URL =
  process.env.NEXT_PUBLIC_EMPOWER_FORM_URL?.trim() || "https://forms.office.com/e/FC0g24zvE7";

const ACCENT = "#008542";

const benefits: { title: string; Icon: typeof Sprout }[] = [
  { title: "Immediate 10% discount on eligible products", Icon: Sprout },
  { title: "Priority delivery service", Icon: Handshake },
  { title: "First access to new product innovations", Icon: Truck },
  { title: "Contribution towards environmentally responsible initiatives", Icon: Percent },
  { title: "Access to community support programs", Icon: Lightbulb },
  { title: "Dedicated customer support hotline", Icon: Headset },
];

export async function generateMetadata(): Promise<Metadata> {
  let page: Awaited<ReturnType<typeof fetchPageBySlug>> = null;
  try {
    page = await fetchPageBySlug(WP_SLUG);
  } catch (err) {
    console.error("[empower-program] generateMetadata: fetch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Empower Program";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const description = rawExcerpt
    ? decodeHTMLEntities(rawExcerpt)
    : "Join the JOYA and B. Braun Empower Program — samples, support, resources, and exclusive discounts for people living with urinary disorders.";
  const siteOrigin = getPublicSiteOrigin();
  const path = "/empower-program";
  const absoluteUrl = siteOrigin ? `${siteOrigin}${path}` : undefined;

  return {
    title,
    description,
    ...(absoluteUrl
      ? {
          alternates: { canonical: absoluteUrl },
          openGraph: { title, description, type: "website", url: absoluteUrl },
        }
      : {
          openGraph: { title, description, type: "website" },
        }),
  };
}

export default async function EmpowerProgramPage() {
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Empower Program" }];
  let empowerProducts: WooCommerceProduct[] = [];

  try {
    const { data: tags } = await wcGet<Array<{ id: number; slug?: string; name?: string }>>(
      "/products/tags",
      { slug: EMPOWER_TAG_SLUG, per_page: 1 },
      "categories",
    );
    let empowerTagId = Array.isArray(tags) && tags.length > 0 ? Number(tags[0]?.id || 0) : 0;
    if (empowerTagId <= 0) {
      const { data: searchTags } = await wcGet<Array<{ id: number; slug?: string; name?: string }>>(
        "/products/tags",
        { search: "empower", per_page: 50 },
        "categories",
      );
      const matched = (Array.isArray(searchTags) ? searchTags : []).find((t) => {
        const slug = String(t?.slug || "").trim().toLowerCase();
        const name = String(t?.name || "").trim().toLowerCase();
        return slug === EMPOWER_TAG_SLUG || name === EMPOWER_TAG_SLUG || slug.includes("empower") || name.includes("empower");
      });
      empowerTagId = matched ? Number(matched.id || 0) : 0;
    }
    if (empowerTagId > 0) {
      const { data: rows } = await wcGet<WooCommerceProduct[]>(
        "/products",
        {
          tag: String(empowerTagId),
          per_page: 12,
          status: "publish",
          orderby: "popularity",
          order: "desc",
        },
        "products",
      );
      empowerProducts = Array.isArray(rows) ? rows : [];
    }
  } catch (err) {
    console.error("[empower-program] products fetch failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-200 bg-gray-50/80">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
            <nav className="text-sm text-gray-500" aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="text-teal-600 transition-colors hover:text-teal-700">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden className="text-gray-400">
                  /
                </li>
                <li className="font-medium text-gray-900">Empower Program</li>
              </ol>
            </nav>
          </div>
        </div>
        <div className="relative w-full overflow-hidden">
          <Image
            src="/images/Empower-Bbraun-Banner.jpg"
            alt="Empower Program"
            width={1920}
            height={520}
            priority
            className="h-auto w-full object-cover"
          />
        </div>
        <article className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <header className="rounded-3xl border border-[#008542]/20 bg-gradient-to-br from-[#e9f9f1] via-white to-[#f5fcf8] p-6 shadow-sm sm:p-10">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#008542] ring-1 ring-[#008542]/25">
                  <ShieldCheck className="h-4 w-4" />
                  JOYA x B. Braun
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
                  Empower Program
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-700 sm:text-lg">
                  Join our support-first continence program and access eligible products with Empower pricing,
                  practical guidance, and priority service.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href={EMPOWER_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-[#008542] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#006d36]"
                  >
                    Apply now
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="#empower-products"
                    className="inline-flex items-center rounded-full border border-[#008542]/35 bg-white px-6 py-3 text-sm font-semibold text-[#006d36] transition hover:bg-[#f2fbf6]"
                  >
                    View Empower products
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-[#008542]/15">
                <div className="flex items-center gap-3 rounded-xl bg-[#f6fcf9] p-3">
                  <Sprout className="h-5 w-5 text-[#008542]" />
                  <span className="text-sm font-medium text-gray-800">10% off eligible items</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-[#f6fcf9] p-3">
                  <Truck className="h-5 w-5 text-[#008542]" />
                  <span className="text-sm font-medium text-gray-800">Priority delivery service</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-[#f6fcf9] p-3">
                  <Headset className="h-5 w-5 text-[#008542]" />
                  <span className="text-sm font-medium text-gray-800">Dedicated support team</span>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-10 space-y-6 text-left text-gray-800">
            <p className="text-base leading-relaxed sm:text-lg">
              JOYA has partnered with <strong className="font-semibold text-gray-900">B. Braun</strong> to bring
              you the Empower Program — a dedicated support service for people living with urinary disorders,
              designed to help you feel more confident every day.
            </p>
            <p className="text-base leading-relaxed sm:text-lg">
              Whether you’re new to continence care or looking for better options, we’re here to guide you with
              trusted products, education, and personal support.
            </p>
          </div>

          <div className="mt-10 w-full text-left">
            <p className="text-base font-semibold text-gray-900 sm:text-lg">
              Through the Empower Program, you&apos;ll receive:
            </p>
            <ul className="mt-4 list-[square] space-y-2 pl-6 text-gray-700 marker:text-[#008542] sm:text-lg">
              <li>Free product samples to find what works best for you</li>
              <li>Personalised email support tailored to your needs</li>
              <li>Access to helpful educational resources</li>
              <li>Exclusive product discounts</li>
            </ul>
          </div>

          <section className="mt-14 text-left" aria-labelledby="benefits-heading">
            <h2 id="benefits-heading" className="text-lg font-bold text-gray-900 sm:text-xl">
              Benefits of joining the Empower Program with B. Braun:
            </h2>

            <ul className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map(({ title, Icon }) => (
                <li key={title} className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center">
                    <Icon className="h-14 w-14" strokeWidth={1.5} style={{ color: ACCENT }} aria-hidden />
                  </div>
                  <p className="max-w-xs text-sm leading-snug text-gray-800 sm:text-base">{title}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* <section className="mt-14 w-full" aria-labelledby="empower-cta-heading">
            <div className="mx-auto max-w-3xl rounded-3xl border border-[#008542]/20 bg-gradient-to-br from-white to-[#f1fbf6] px-6 py-8 text-center shadow-sm sm:px-10">
              <h2 id="empower-cta-heading" className="text-lg font-bold tracking-tight text-gray-900 sm:text-2xl">
                To join the Empower Program, please register via the form below
              </h2>
              <p className="mt-3 text-sm text-gray-600 sm:text-base">
                Complete the quick registration and our team will help you access Empower benefits.
              </p>
              <a
                href={EMPOWER_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#008542] px-10 py-3 text-sm font-semibold text-white transition hover:bg-[#006d36]"
              >
                Apply
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section> */}

          <section id="empower-products" className="mt-16 border-t border-gray-200 pt-12" aria-labelledby="empower-products-heading">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 id="empower-products-heading" className="text-2xl font-bold tracking-tight text-gray-900">
                  Products under Empower Program
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Explore products tagged for Empower benefits.
                </p>
              </div>
              <Pill className="hidden h-7 w-7 text-[#008542] sm:block" aria-hidden />
            </div>

            {empowerProducts.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {empowerProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    sku={product.sku}
                    price={String(product.price ?? "")}
                    sale_price={product.sale_price}
                    regular_price={product.regular_price}
                    on_sale={product.on_sale}
                    tax_class={product.tax_class}
                    tax_status={product.tax_status}
                    average_rating={product.average_rating}
                    rating_count={product.rating_count}
                    tags={product.tags}
                    imageUrl={product.images?.[0]?.src}
                    imageAlt={product.images?.[0]?.alt || product.name}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-sm text-gray-600">
                No Empower-tagged products found right now. Please check again shortly.
              </div>
            )}
          </section>
        </article>
      </div>
    </>
  );
}
