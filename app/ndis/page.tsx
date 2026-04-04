import type { Metadata } from "next";
import NDISWizard from "@/components/ndis/NDISWizard";
import {
  ShoppingBag,
  Headphones,
  CreditCard,
  ShoppingCart,
  Gift,
  RotateCcw,
  Phone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "NDIS | Medical Supplies for NDIS Participants",
  description:
    "Joya Medical Supplies - NDIS Registered Provider. Medical supplies, continence care, and healthcare essentials for NDIS participants. Participant, Plan Manager, Support Coordinator.",
  openGraph: {
    title: "NDIS - Joya Medical Supplies",
    description: "Medical Supplies for NDIS Participants. NDIS Registered Provider.",
    type: "website",
  },
  alternates: { canonical: "/ndis" },
};

/* Brand colors – also in globals.css as --ndis-primary, --ndis-secondary (hex here for gradient/alpha) */
const NDIS_PRIMARY = "#5B1D65";
const NDIS_SECONDARY = "#1F605F";
const CONTENT_MAX_W = "max-w-7xl"; // use more page width – less empty space on sides

const WHY_JOYA = [
  { icon: ShoppingBag, text: "Store Pickup Option" },
  { icon: Headphones, text: "24/7 Customer Support Via Email" },
  { icon: CreditCard, text: "NDIS Payment Options Available" },
  { icon: ShoppingCart, text: "24/7 Online Shopping" },
  { icon: Gift, text: "Free Sampling" },
  { icon: RotateCcw, text: "Easy Return Policy" },
];

export default function NDISPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero banner – full width, reduced height */}
      <section
        className="w-full text-white py-6 md:py-10"
        style={{
          background: `linear-gradient(to right, ${NDIS_PRIMARY}, #2d1b33 50%, #1a0f1e)`,
        }}
      >
        <div className={`container mx-auto ${CONTENT_MAX_W} px-4 sm:px-6`}>
          {/* Top row: Joya left, #WE SUPPORT NDIS right */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5 md:mb-6">
            <span className="text-lg md:text-xl font-bold text-white">Joya Medical Supplies</span>
            <span
              className="text-sm md:text-base font-normal uppercase tracking-wide"
              style={{ color: "#b8a0c0" }}
            >
              #WE SUPPORT NDIS
            </span>
          </div>

          {/* Left-aligned main content */}
          <div className="text-left">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white mb-4"
              style={{
                backgroundColor: "#3d2d42",
                border: "1px solid rgba(168, 133, 184, 0.5)",
              }}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" aria-hidden />
              NDIS Registered Provider
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-5 leading-tight max-w-2xl">
              Medical Supplies for
              <br />
              NDIS Participants
            </h1>
            {/* Static labels only – not clickable (old design) */}
            <div className="flex flex-wrap gap-4">
              <span
                className="rounded-full border px-6 py-3 text-sm font-medium text-white cursor-default"
                style={{
                  backgroundColor: "#3d2d42",
                  borderColor: "rgba(168, 133, 184, 0.6)",
                }}
              >
                Participant
              </span>
              <span
                className="rounded-full border px-6 py-3 text-sm font-medium text-white cursor-default"
                style={{
                  backgroundColor: "#3d2d42",
                  borderColor: "rgba(168, 133, 184, 0.6)",
                }}
              >
                Plan Manager
              </span>
              <span
                className="rounded-full border px-6 py-3 text-sm font-medium text-white cursor-default"
                style={{
                  backgroundColor: "#3d2d42",
                  borderColor: "rgba(168, 133, 184, 0.6)",
                }}
              >
                Support Coordinator
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* NDIS Participants – theory content */}
      <section className="py-14 md:py-20 bg-white">
        <div className={`container mx-auto ${CONTENT_MAX_W} px-4 sm:px-6`}>
          <h2
            className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-2"
            style={{ color: NDIS_PRIMARY }}
          >
            <span
              className="w-1.5 h-8 rounded-full"
              style={{ backgroundColor: NDIS_PRIMARY }}
              aria-hidden
            />
            NDIS Participants
          </h2>
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              The NATIONAL DISABILITY INSURANCE SCHEME (NDIS) is administered by the NDIA, and funds
              reasonable and important supports and services to help people with permanent or
              significant disabilities so they get to spend more time with their loved ones, be more
              independent, have access to volunteer opportunities in their community, learn new
              skills, and generally enhance their quality of life. Anyone with a disability can
              access community services through the NDIS. This involves giving information on the
              kinds of help offered by each state and territory government, as well as links to
              physicians, local organizations, athletic clubs, support groups, libraries, and
              schools.
            </p>
            <p>
              Over 500,000 Australians with disabilities are now eligible to get the services and
              assistance they require, including help to 80,000+ kids who have developmental delays
              by making sure they get help as soon as possible so they may have long and prospering
              lives. All thanks to NDIS.
            </p>
          </div>
        </div>
      </section>

      {/* Why Choose Joya – same width; cards equal height */}
      <section className="py-14 md:py-20 bg-gray-100">
        <div className={`container mx-auto ${CONTENT_MAX_W} px-4 sm:px-6 text-center`}>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Why Choose Joya?</h2>
          <p className="text-gray-600 mb-10">
            As an{" "}
            <span className="font-bold" style={{ color: NDIS_PRIMARY }}>
              NDIS Registered Provider
            </span>
            , Joya always offers convenient facilities.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_JOYA.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center justify-center min-h-[180px] gap-3"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${NDIS_PRIMARY}18` }}
                >
                  <Icon className="w-6 h-6" style={{ color: NDIS_PRIMARY }} />
                </div>
                <p className="font-medium text-gray-900">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NDIS info block – theory content; less bottom padding to reduce gap to How to Register */}
      <section className="pt-14 md:pt-20 pb-6 md:pb-8 bg-white">
        <div
          className={`container mx-auto ${CONTENT_MAX_W} px-4 sm:px-6 space-y-4 text-gray-700 leading-relaxed`}
        >
          <p>
            While NDIS offers its participants funding, it also gives them control over it through a
            customized plan. With an NDIS plan and its desired outcome, people with permanent and
            significant disabilities can have wide access to medical supplies and healthcare
            services that an NDIS-registered provider like Joya Medical Supplies provides.
          </p>
          <p>
            Daily necessities that are needed to help manage the demands regarding a person&apos;s
            disability are known as NDIS consumables. These products fall under the NDIS core
            support category, which also includes things like incontinence pads, pants, and liners,
            as well as nutritional supplements, wound care supplies, and other disposable continence
            products. At JOYA you get a wide range of products falling under the category of NDIS
            consumables at an adaptable budget along with products and equipment suitable for the
            needs of NDIS participants.
          </p>
          <p>
            You can easily place your order at the trusted and most reliable, Joya Medical Supplies.
            To learn about the process of registering as an NDIS participant follow the steps given
            below.
          </p>
        </div>
      </section>

      {/* How to Register – less top padding so theory and this section sit closer */}
      <section id="register" className="pt-6 md:pt-8 pb-14 md:pb-20 bg-white">
        <div className="mx-auto max-w-[96rem] px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-2">
            How to Register
          </h2>
          <p className="text-center text-gray-600 mb-1">NDIS Participant Online</p>
          <p className="text-center text-sm text-gray-500 mb-6">For Direct NDIS Inquiry</p>

          <div className="flex justify-center mb-10">
            <a
              href="tel:0451852124"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: NDIS_PRIMARY }}
            >
              <Phone className="w-5 h-5" />
              045 1852 124
            </a>
          </div>

          <NDISWizard />
        </div>
      </section>

      {/* Footer strip – full width (NDIS route skips layout container) */}
      <section
        className="w-full text-white py-10 md:py-12"
        style={{ backgroundColor: NDIS_PRIMARY }}
      >
        <div className={`container mx-auto ${CONTENT_MAX_W} px-4 sm:px-6 text-center`}>
          <p className="font-medium mb-1">
            Your order will be dispatched once payment is received.
          </p>
          <p className="text-white/80 text-sm">Joya Medical Supplies - Trusted NDIS Provider</p>
        </div>
      </section>
    </div>
  );
}
