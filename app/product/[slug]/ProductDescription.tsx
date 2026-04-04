"use client";

import { sanitizeHTML } from "@/lib/xss-sanitizer";
import parse from "html-react-parser";

export default function ProductDescription({ html }: { html: string }) {
  const clean = sanitizeHTML(html);
  return <>{parse(clean)}</>;
}
