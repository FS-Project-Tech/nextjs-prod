"use client";

import { ShieldCheck, Truck, Headphones, BadgeCheck, Star } from "lucide-react";

const features = [
  {
    icon: <Star className="w-6 h-6 text-teal-600" />,
    title: "Reliable",
    description: "Over 11k+ products",
  },
  {
    icon: <Truck className="w-6 h-6 text-teal-600" />,
    title: "Home Delivery",
    description: "Free delivery to your home*",
  },
  {
    icon: <ShieldCheck className="w-6 h-6 text-teal-600" />,
    title: "Secure Payment",
    description: "100% Secure Payments",
  },
  {
    icon: <Headphones className="w-6 h-6 text-teal-600" />,
    title: "After-hours Support",
    description: "Available via live chat and emails",
  },
  {
    icon: <BadgeCheck className="w-6 h-6 text-teal-600" />,
    title: "Australian Business",
    description: "A family owned business",
  },
];

export default function FeatureStrip() {
  return (
    <section className="py-6 container mx-auto">
      <div className="w-full mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {features.map((item, index) => (
            <div
              key={index}
              className="flex items-start gap-4 bg-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="flex-shrink-0">{item.icon}</div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                <p className="text-xs text-gray-600 mt-1">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
