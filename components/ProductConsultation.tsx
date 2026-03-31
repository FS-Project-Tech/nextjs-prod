"use client";

import { useState, useMemo } from "react";
import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";

interface ProductConsultationProps {
  product: WooCommerceProduct;
  variations: WooCommerceVariation[];
}

/**
 * Extracts text content from HTML string
 */
function extractText(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Identifies medical category from product data
 */
function identifyMedicalCategory(
  product: WooCommerceProduct
): string {
  const allText = [
    product.name,
    product.short_description,
    product.description,
    ...(product.categories || []).map((c) => c.name),
    ...(product.tags || []).map((t) => t.name),
  ]
    .join(" ")
    .toLowerCase();

  const categories = [
    { keywords: ["diabetic", "diabetes", "glucose", "insulin", "blood sugar"], name: "Diabetic Supplies" },
    { keywords: ["wound", "dressing", "bandage", "gauze", "healing"], name: "Wound Care" },
    { keywords: ["mobility", "walker", "cane", "crutch", "wheelchair", "assist"], name: "Mobility Aids" },
    { keywords: ["respiratory", "oxygen", "nebulizer", "inhaler", "breathing"], name: "Respiratory Care" },
    { keywords: ["ppe", "mask", "glove", "gown", "protective", "safety"], name: "PPE (Personal Protective Equipment)" },
    { keywords: ["continence", "incontinence", "catheter", "urinary", "adult diaper"], name: "Continence Care" },
    { keywords: ["surgical", "surgery", "scalpel", "suture", "sterile"], name: "Surgical Products" },
    { keywords: ["monitor", "blood pressure", "thermometer", "pulse", "vital"], name: "Monitoring Equipment" },
    { keywords: ["first aid", "emergency", "cpr", "trauma", "rescue"], name: "First Aid" },
    { keywords: ["diagnostic", "test", "stethoscope", "otoscope", "examination"], name: "Diagnostic Tools" },
  ];

  for (const category of categories) {
    if (category.keywords.some((keyword) => allText.includes(keyword))) {
      return category.name;
    }
  }

  return "General Medical Supplies";
}

/**
 * Generates product overview from available data
 */
function generateProductOverview(product: WooCommerceProduct): string {
  if (product.short_description) {
    return extractText(product.short_description);
  }
  if (product.description) {
    const desc = extractText(product.description);
    return desc.length > 300 ? desc.substring(0, 300) + "..." : desc;
  }
  return `This is ${product.name}, a medical supply product.`;
}

/**
 * Identifies target users from product description
 */
function identifyTargetUsers(product: WooCommerceProduct): string {
  const allText = [
    product.name,
    product.short_description,
    product.description,
  ]
    .join(" ")
    .toLowerCase();

  const userGroups = [];

  if (allText.includes("pediatric") || allText.includes("child") || allText.includes("infant")) {
    userGroups.push("children and infants");
  }
  if (allText.includes("adult") || allText.includes("senior") || allText.includes("elderly")) {
    userGroups.push("adults and seniors");
  }
  if (allText.includes("hospital") || allText.includes("clinical") || allText.includes("medical facility")) {
    userGroups.push("healthcare professionals and medical facilities");
  }
  if (allText.includes("home") || allText.includes("personal") || allText.includes("self")) {
    userGroups.push("individuals for home use");
  }
  if (allText.includes("diabetic") || allText.includes("diabetes")) {
    userGroups.push("people with diabetes");
  }
  if (allText.includes("mobility") || allText.includes("disability")) {
    userGroups.push("individuals with mobility needs");
  }

  if (userGroups.length > 0) {
    return `This product is typically used by ${userGroups.join(", ")}.`;
  }

  return "This product is designed for general medical use. Please consult with a healthcare professional to determine if it's suitable for your specific needs.";
}

/**
 * Extracts sizing/variant information
 */
function extractSizingInfo(
  product: WooCommerceProduct,
  variations: WooCommerceVariation[]
): string {
  // Check attributes for size/variant info
  const attributes = product.attributes || [];
  const sizeAttributes = attributes.filter((attr: any) => {
    const name = (attr.name || "").toLowerCase();
    return (
      name.includes("size") ||
      name.includes("variant") ||
      name.includes("model") ||
      name.includes("type")
    );
  });

  if (sizeAttributes.length > 0) {
    const info: string[] = [];
    sizeAttributes.forEach((attr: any) => {
      const options = Array.isArray(attr.options) ? attr.options : [];
      if (options.length > 0) {
        info.push(
          `${attr.name}: Available in ${options.join(", ")}.`
        );
      }
    });
    if (info.length > 0) {
      return info.join(" ");
    }
  }

  // Check variations
  if (variations.length > 0) {
    const variationAttrs = new Set<string>();
    variations.forEach((v) => {
      v.attributes.forEach((attr) => {
        variationAttrs.add(`${attr.name}: ${attr.option}`);
      });
    });
    if (variationAttrs.size > 0) {
      return `This product is available in different variations. Please review the available options above to select the right variant for your needs.`;
    }
  }

  // Check dimensions
  if (product.dimensions) {
    const dims = product.dimensions;
    if (dims.length || dims.width || dims.height) {
      return `Product dimensions: ${dims.length || "N/A"} × ${dims.width || "N/A"} × ${dims.height || "N/A"}. Use these measurements to determine if this product fits your requirements.`;
    }
  }

  return "This information is not listed. Would you like our support team to help you?";
}

/**
 * Generates alternative product suggestions based on keywords
 */
function generateAlternatives(product: WooCommerceProduct): string[] {
  const allText = [
    product.name,
    product.short_description,
    product.description,
    ...(product.tags || []).map((t) => t.name),
  ]
    .join(" ")
    .toLowerCase();

  const alternatives: string[] = [];
  const keywords = allText.split(/\s+/).filter((w) => w.length > 4);

  // Extract key medical terms
  const medicalTerms = keywords.filter((word) => {
    const medicalKeywords = [
      "diabetic",
      "wound",
      "mobility",
      "respiratory",
      "continence",
      "surgical",
      "monitor",
      "first aid",
      "diagnostic",
    ];
    return medicalKeywords.some((kw) => word.includes(kw));
  });

  if (medicalTerms.length > 0) {
    medicalTerms.slice(0, 3).forEach((term) => {
      alternatives.push(
        `Other ${term.charAt(0).toUpperCase() + term.slice(1)} products that may meet your needs`
      );
    });
  } else {
    // Generic alternatives based on category
    const categoryName = product.categories?.[0]?.name || "medical supplies";
    alternatives.push(
      `Other ${categoryName} products`,
      `Similar products in the ${categoryName} category`,
      `Alternative solutions for your medical needs`
    );
  }

  return alternatives.slice(0, 3);
}

/**
 * Generates common mistakes based on product description
 */
function generateCommonMistakes(product: WooCommerceProduct): string[] {
  const allText = [
    product.name,
    product.short_description,
    product.description,
  ]
    .join(" ")
    .toLowerCase();

  const mistakes: string[] = [];

  // General mistakes
  mistakes.push(
    "Not reading the product description and specifications carefully before purchase"
  );

  if (allText.includes("size") || allText.includes("dimension")) {
    mistakes.push(
      "Not checking the size or dimensions before ordering, which may result in an incorrect fit"
    );
  }

  if (allText.includes("sterile") || allText.includes("disposable")) {
    mistakes.push(
      "Reusing single-use or disposable products, which can compromise safety and effectiveness"
    );
  }

  if (allText.includes("prescription") || allText.includes("medical")) {
    mistakes.push(
      "Using medical products without consulting a healthcare professional when required"
    );
  }

  if (allText.includes("expir") || allText.includes("date")) {
    mistakes.push(
      "Not checking expiration dates before use, which can affect product safety and effectiveness"
    );
  }

  mistakes.push(
    "Not storing the product according to manufacturer instructions, which may affect its quality"
  );

  return mistakes.slice(0, 5);
}

/**
 * Generates initial FAQ questions based on product data
 */
function generateInitialFAQs(product: WooCommerceProduct): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];

  if (product.short_description) {
    faqs.push({
      question: "What is this product used for?",
      answer: extractText(product.short_description),
    });
  }

  if (product.attributes && product.attributes.length > 0) {
    faqs.push({
      question: "What variations are available?",
      answer: `This product is available in different variations. Please check the product attributes section above for available options.`,
    });
  }

  if (product.dimensions) {
    faqs.push({
      question: "What are the product dimensions?",
      answer: `The product dimensions are: ${product.dimensions.length || "N/A"} × ${product.dimensions.width || "N/A"} × ${product.dimensions.height || "N/A"}.`,
    });
  }

  return faqs;
}

export default function ProductConsultation({
  product,
  variations,
}: ProductConsultationProps) {
  // Memoize expensive computations
  const productOverview = useMemo(() => generateProductOverview(product), [product]);
  const medicalCategory = useMemo(() => identifyMedicalCategory(product), [product]);
  const targetUsers = useMemo(() => identifyTargetUsers(product), [product]);
  const sizingInfo = useMemo(() => extractSizingInfo(product, variations), [product, variations]);
  const alternatives = useMemo(() => generateAlternatives(product), [product]);
  const commonMistakes = useMemo(() => generateCommonMistakes(product), [product]);
  const initialFAQs = useMemo(() => generateInitialFAQs(product), [product]);

  const [faqQuestions, setFaqQuestions] = useState<
    Array<{ question: string; answer: string; id: string }>
  >(
    initialFAQs.map((faq, idx) => ({
      ...faq,
      id: `faq-${idx}`,
    }))
  );
  const [newQuestion, setNewQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Memoize product data for intelligent search
  const productDataForSearch = useMemo(() => {
    const descriptionText = extractText(product.description || product.short_description || "");
    const shortDescText = extractText(product.short_description || "");
    const fullText = [
      product.name,
      shortDescText,
      descriptionText,
      ...(product.categories || []).map((c) => c.name),
      ...(product.tags || []).map((t) => t.name),
      ...(product.attributes || []).map((attr: any) => `${attr.name}: ${Array.isArray(attr.options) ? attr.options.join(", ") : attr.options}`),
    ].join(" ");

    return {
      descriptionText,
      shortDescText,
      fullText: fullText.toLowerCase(),
      sentences: descriptionText.split(/[.!?]+/).filter((s) => s.trim().length > 15),
      attributes: product.attributes || [],
      dimensions: product.dimensions,
      sku: product.sku,
      price: product.price,
      stockStatus: product.stock_status,
    };
  }, [product]);

  /**
   * Intelligent question answering based on product data
   */
  const generateAnswerFromQuestion = (question: string): string => {
    const questionLower = question.toLowerCase().trim();
    const questionWords = questionLower.split(/\s+/).filter((w) => w.length > 2);

    // 1. Size/Dimension questions
    if (questionLower.match(/\b(size|dimension|measure|measurement|width|length|height|how big|how large)\b/)) {
      return sizingInfo;
    }

    // 2. Usage/What questions
    if (questionLower.match(/\b(what|use|used for|purpose|function|how to use|how do i use)\b/)) {
      // Try to find specific usage information
      const usageKeywords = ["use", "used", "purpose", "function", "designed", "intended"];
      const relevantSentences = productDataForSearch.sentences.filter((s) =>
        usageKeywords.some((kw) => s.toLowerCase().includes(kw))
      );
      if (relevantSentences.length > 0) {
        return relevantSentences.slice(0, 2).join(" ") + ".";
      }
      return productOverview;
    }

    // 3. Who/Suitable questions
    if (questionLower.match(/\b(who|suitable|for whom|recommended|intended for|target)\b/)) {
      return targetUsers;
    }

    // 4. Price questions
    if (questionLower.match(/\b(price|cost|how much|pricing|expensive|cheap)\b/)) {
      if (productDataForSearch.price) {
        return `The price for this product is $${productDataForSearch.price}. Please check the product page for current pricing, sale information, and any applicable discounts.`;
      }
      return "Please check the product page for current pricing information.";
    }

    // 5. Stock/Availability questions
    if (questionLower.match(/\b(stock|available|in stock|out of stock|availability|inventory)\b/)) {
      if (productDataForSearch.stockStatus) {
        const status = productDataForSearch.stockStatus;
        return `The current stock status is: ${status}. Please check the product page for real-time availability.`;
      }
      return "Please check the product page for current stock availability.";
    }

    // 6. SKU/Product code questions
    if (questionLower.match(/\b(sku|product code|item number|model|part number)\b/)) {
      if (productDataForSearch.sku) {
        return `The SKU for this product is: ${productDataForSearch.sku}.`;
      }
      return "The SKU information is not available in the product details.";
    }

    // 7. Attribute/Variation questions
    if (questionLower.match(/\b(variation|variant|option|attribute|available in|color|size|type|model)\b/)) {
      if (productDataForSearch.attributes.length > 0) {
        const attrInfo = productDataForSearch.attributes
          .map((attr: any) => {
            const options = Array.isArray(attr.options) ? attr.options : [];
            return options.length > 0 ? `${attr.name}: ${options.join(", ")}` : null;
          })
          .filter(Boolean)
          .join("; ");
        if (attrInfo) {
          return `This product is available in the following variations: ${attrInfo}. Please check the product page to select your preferred option.`;
        }
      }
      return sizingInfo;
    }

    // 8. Category questions
    if (questionLower.match(/\b(category|type|kind|classification)\b/)) {
      return `This product belongs to the category: ${medicalCategory}.`;
    }

    // 9. Search for specific keywords in product description
    const matchingSentences = productDataForSearch.sentences.filter((sentence) => {
      const sentenceLower = sentence.toLowerCase();
      // Check if any significant word from question appears in sentence
      return questionWords.some((word) => sentenceLower.includes(word));
    });

    if (matchingSentences.length > 0) {
      // Return the most relevant sentences (up to 2)
      return matchingSentences.slice(0, 2).join(" ") + ".";
    }

    // 10. Check if question words appear in product name or categories
    const hasRelevantKeywords = questionWords.some((word) =>
      productDataForSearch.fullText.includes(word)
    );

    if (hasRelevantKeywords) {
      // Return relevant portion of description
      const relevantPart = productDataForSearch.descriptionText.substring(0, 300);
      if (relevantPart.length > 50) {
        return relevantPart + (productDataForSearch.descriptionText.length > 300 ? "..." : "");
      }
    }

    // 11. Default: Provide helpful guidance
    return `Based on the product information available, ${productOverview.substring(0, 200)}... For more specific details about "${question}", please review the full product description above or contact our support team for assistance.`;
  };

  const handleQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || isSubmitting) return;

    setIsSubmitting(true);

    // Use setTimeout to prevent blocking the UI
    setTimeout(() => {
      const answer = generateAnswerFromQuestion(newQuestion);

      const newFaq = {
        question: newQuestion,
        answer,
        id: `faq-${Date.now()}`,
      };

      setFaqQuestions((prev) => [...prev, newFaq]);
      setNewQuestion("");
      setIsSubmitting(false);
    }, 100);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Product Consultation: {product.name}
        </h1>
        <p className="text-gray-600">
          Get expert guidance to make an informed purchasing decision
        </p>
      </div>

      <section id="product-summary" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Product Overview</h2>
        <p className="text-gray-700 leading-relaxed">
          {productOverview}
        </p>
      </section>

      <section id="product-category" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Medical Category</h2>
        <p className="text-gray-700 leading-relaxed">
          {medicalCategory}
        </p>
      </section>

      <section id="who-is-this-for" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Who Is This Product For?</h2>
        <p className="text-gray-700 leading-relaxed">
          {targetUsers}
        </p>
      </section>

      <section id="how-to-choose" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">How to Choose the Right Size or Variant</h2>
        <p className="text-gray-700 leading-relaxed">
          {sizingInfo}
        </p>
      </section>

      <section id="alternatives" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Suggested Alternatives</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          {alternatives.map((alt, idx) => (
            <li key={idx}>{alt}</li>
          ))}
        </ul>
      </section>

      <section id="common-mistakes" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Common Mistakes to Avoid</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          {commonMistakes.map((mistake, idx) => (
            <li key={idx}>{mistake}</li>
          ))}
        </ul>
      </section>

      <section id="faq" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Ask Anything About This Product</h2>
        
        <div className="space-y-4 mb-6">
          {faqQuestions.map((faq) => (
            <div key={faq.id} className="border-b border-gray-200 pb-4 last:border-b-0">
              <h3 className="font-semibold text-gray-900 mb-2">{faq.question}</h3>
              <p className="text-gray-700">{faq.answer}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleQuestionSubmit} className="mt-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Ask a question about this product..."
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f605f] focus:border-transparent"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!newQuestion.trim() || isSubmitting}
              className="btn-brand rounded-md px-6 py-2 text-sm font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Ask"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

