interface SpecialPoint {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: boolean;
}

const specialPoints: SpecialPoint[] = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    title: "Measure & Fit-Out Service at Home",
    description: "We come to you! Free personal visit by our staff for compression garments fitting. Avoid sizing errors and explore color, material, and suitability options before purchasing.",
    highlight: true,
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    title: "Free Delivery - Gold Coast Region",
    description: "Free delivery within the Gold Coast region for orders over $300. A service unmatched in the industry, making quality healthcare products more accessible.",
    highlight: true,
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Emergency Delivery Service",
    description: "Exclusive to registered health professionals and care services. Less than 4-hour delivery within a 90-kilometre radius of the Gold Coast for urgent medical supply needs.",
    highlight: true,
  },
];

export default function WhatMakesUsSpecialSection() {
  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            What Makes Us Special
          </h2>
          <p className="text-lg text-gray-600 mb-10 max-w-3xl mx-auto">
            At Joya, we understand that everyone might not be able to reach us online, so we have 
            decided to come to you. Our unique services are designed to make healthcare products more 
            accessible and convenient for everyone.
          </p>
        </div>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {specialPoints.map((point, index) => (
              <div
                key={index}
                className={`relative rounded-xl p-6 border-2 transition-all duration-300 hover:shadow-lg ${
                  point.highlight
                    ? "bg-gradient-to-br from-teal-50 to-blue-50 border-teal-200 hover:border-teal-300"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className={`mb-4 flex justify-center ${
                  point.highlight ? "text-teal-600" : "text-gray-600"
                }`}>
                  <div className={`p-3 rounded-lg ${
                    point.highlight ? "bg-teal-100" : "bg-gray-100"
                  }`}>
                    {point.icon}
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 text-center">
                  {point.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed text-center">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

