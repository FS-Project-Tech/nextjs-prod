import type { Metadata } from "next";
import {
  Headset,
  Lightbulb,
  Percent,
  Sprout,
  Truck,
  Handshake,
} from "lucide-react";
import PrefetchLink from "@/components/PrefetchLink";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { decodeHTMLEntities } from "@/lib/xss-sanitizer";

const WP_SLUG = "empower-program";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

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
  const page = await fetchPageBySlug(WP_SLUG);
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

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/empower-program` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${siteUrl}/empower-program`,
    },
  };
}

export default async function EmpowerProgramPage() {
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Empower Program" }];

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

        <article className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <header className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Empower Program
            </h1>
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

          <section className="mt-14 w-full text-left" aria-labelledby="empower-cta-heading">
            <h2 id="empower-cta-heading" className="text-base font-bold text-gray-900 sm:text-lg">
              To join the Empower Program, please register via the form below
            </h2>
            <a
              href={EMPOWER_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex rounded-full bg-gray-900 px-10 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Apply
            </a>
          </section>
        </article>
      </div>
    </>
  );
}
