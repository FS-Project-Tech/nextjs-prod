import type { Metadata } from "next";
import ContactUsForm from "@/components/ContactUsForm";
import { getSiteContact } from "@/lib/site-contact";
 
const site = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Contact";
 
export const metadata: Metadata = {
  title: "Contact Us",
  description: `Get in touch with ${site}.`,
  alternates: { canonical: "/contact-us" },
};
 
function PhoneRow({ phone, isMobile }: { phone: string; isMobile?: boolean }) {
  const tel = phone.replace(/\s/g, "");
  return (
    <a href={`tel:${tel}`} className="flex items-start gap-3 text-gray-700 hover:text-gray-900">
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {isMobile ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        )}
      </svg>
      <span>{phone}</span>
    </a>
  );
}
 
function ContactColumn({
  title,
  addressLines,
  phones,
  email,
  showAddress,
}: {
  title: string;
  addressLines: string[];
  phones: string[];
  email: string;
  showAddress: boolean;
}) {
  return (
    <div className="text-left">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <ul className="mt-3 space-y-3 text-sm text-gray-700">
        {showAddress && addressLines.length > 0 && (
          <li className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>
              {addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </li>
        )}
        {phones.map((p) => (
          <li key={p}>
            <PhoneRow phone={p} isMobile={/^04/.test(p.replace(/\s/g, ""))} />
          </li>
        ))}
        {email ? (
          <li>
            <a href={`mailto:${email}`} className="flex items-start gap-3 text-gray-700 hover:text-gray-900">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="break-all">{email}</span>
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
 
export default function ContactUsPage() {
  const c = getSiteContact();
 
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">Get In Touch</h1>
          <p className="mt-2 text-sm text-gray-600 sm:text-base">
            We want to hear from you. Let us know how we can help.
          </p>
        </header>
 
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <ContactUsForm />
          </div>
 
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <iframe
              title="Joya Medical Supplies location"
              src={c.mapEmbedUrl}
              className="h-[min(380px,55vh)] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
 
        <section className="mt-12 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-center text-lg font-semibold text-gray-900 sm:text-xl">
            Contact Us For Any Questions
          </h2>
          <hr className="mx-auto mt-4 w-24 border-gray-300" />
 
          <div className="mt-8 grid gap-10 sm:grid-cols-2 sm:gap-12">
            <ContactColumn
              title={c.officeLabel}
              addressLines={c.addressLines}
              phones={c.officePhones}
              email={c.email}
              showAddress
            />
            <ContactColumn
              title={c.serviceLabel}
              addressLines={c.addressLines}
              phones={c.servicePhones}
              email={c.email}
              showAddress={false}
            />
          </div>
        </section>
      </div>
    </div>
  );
}