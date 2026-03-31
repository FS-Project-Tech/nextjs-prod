"use client";

import { motion, Variants } from "framer-motion";

const floatingChips = [
  { label: "Gloves", emoji: "🧤", href: "/shop?category=gloves" },
  { label: "Masks", emoji: "😷", href: "/shop?category=masks" },
  { label: "Sanitizers", emoji: "🧴", href: "/shop?category=sanitizers" },
  { label: "First Aid", emoji: "🩹", href: "/shop?category=first-aid" },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 },
  },
};

const chipVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 200 },
  },
};

export default function HeroEnhancement() {
  return (
    <motion.div
      className="relative py-8 md:py-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div className="text-center mb-6" variants={itemVariants}>
        <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3">
          Premium Medical Supplies
        </h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
          Trusted healthcare solutions delivered to your door
        </p>
      </motion.div>

      {/* <motion.div className="max-w-2xl mx-auto mb-8" variants={itemVariants}>
        <SearchBar className="w-full" />
        <p className="text-xs text-gray-500 text-center mt-2">
          Search among 9,000+ trusted medical products
        </p>
      </motion.div> */}

      <motion.div
        className="flex flex-wrap justify-center gap-3 px-4"
        variants={containerVariants}
      >
        {floatingChips.map((chip) => (
          <motion.a
            key={chip.label}
            href={chip.href}
            variants={chipVariants}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm hover:shadow-md transition-shadow text-sm font-medium text-gray-700 hover:text-teal-700"
          >
            <span className="text-lg">{chip.emoji}</span>
            <span>{chip.label}</span>
          </motion.a>
        ))}
      </motion.div>
    </motion.div>
  );
}