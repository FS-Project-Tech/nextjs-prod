/**
 * Generate a PDF for a category digital catalogue (cover + subcategory product tables).
 * Uses jsPDF text API so the PDF has selectable, searchable text.
 */

import { formatPrice } from "./format-utils";

type SubcategoryInfo = { slug: string; name: string };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const ROW_HEIGHT = 6;
const HEADER_ROW_HEIGHT = 8;
const FONT_SIZE_BODY = 9;
const FONT_SIZE_HEADER = 10;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_COVER = 22;

function formatAttributeColumn(attrs: Array<{ name?: string; options?: string[] }>): string {
  if (!attrs.length) return "—";
  const parts: string[] = [];
  for (const a of attrs) {
    const options = Array.isArray(a.options) ? a.options : [];
    const value = options
      .map((o) => String(o).trim())
      .filter(Boolean)
      .join(", ");
    if (value) parts.push(value);
  }
  return parts.length ? parts.join(" / ") : "—";
}

type CatalogueRow = {
  sku: string;
  name: string;
  attribute: string;
  price: string;
  brand: string;
};

function typesenseListingToRow(p: Record<string, unknown>): CatalogueRow {
  const attrs = (p.attributes as Array<{ name?: string; options?: string[] }> | undefined) || [];
  const rawPrice = p.price != null ? String(p.price) : "";
  return {
    sku: p.sku != null && String(p.sku) !== "" ? String(p.sku) : "—",
    name: String(p.name ?? ""),
    attribute: formatAttributeColumn(attrs) || "—",
    price: rawPrice !== "" ? formatPrice(rawPrice) : "—",
    brand: String(p.brand_name ?? p.brand ?? ""),
  };
}

function byBrand(rows: CatalogueRow[]): [string, CatalogueRow[]][] {
  const map = new Map<string, CatalogueRow[]>();
  rows.forEach((r) => {
    const key = r.brand || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  });
  return Array.from(map.entries()).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export async function generateCataloguePDF(
  parentName: string,
  subcategories: SubcategoryInfo[]
): Promise<Blob> {
  const subcategoryData: {
    name: string;
    rows: CatalogueRow[];
  }[] = [];

  for (const sub of subcategories) {
    const qs = new URLSearchParams({
      category_slug: sub.slug,
      per_page: "200",
      page: "1",
      sortBy: "popularity",
      q: "*",
    });
    const res = await fetch(`/api/typesense/search?${qs.toString()}`);
    const json = await res.json();
    const products = Array.isArray(json.products) ? json.products : [];
    const rows = products.map((doc: Record<string, unknown>) => typesenseListingToRow(doc));
    if (rows.length) {
      subcategoryData.push({ name: sub.name, rows });
    }
  }

  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF("p", "mm", "a4");
  const contentW = PAGE_W - 2 * MARGIN;
  const colWidths = [22, 75, 48, 25]; // SKU, Product Name, Attribute, Price
  const xStart = MARGIN;

  let page = 0;
  let y = MARGIN;

  function addPage(): void {
    if (page > 0) pdf.addPage();
    page++;
    y = MARGIN;
  }

  function checkPageBreak(needed: number): void {
    if (y + needed > PAGE_H - MARGIN) addPage();
  }

  // Cover page
  pdf.setFontSize(FONT_SIZE_COVER);
  pdf.setFont("helvetica", "bold");
  pdf.text(parentName, PAGE_W / 2, 80, { align: "center" });
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  pdf.text("Digital catalogue", PAGE_W / 2, 95, { align: "center" });
  pdf.setFontSize(10);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Generated on ${new Date().toLocaleString()}`, PAGE_W / 2, PAGE_H - 20, {
    align: "center",
  });
  pdf.setTextColor(0, 0, 0);

  addPage();

  for (const { name: subName, rows } of subcategoryData) {
    checkPageBreak(HEADER_ROW_HEIGHT + 4);
    pdf.setFontSize(FONT_SIZE_TITLE - 2);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(13, 148, 136);
    pdf.text(`${subName} — Digital Catalogue`, xStart, y);
    pdf.setTextColor(0, 0, 0);
    y += HEADER_ROW_HEIGHT;

    const grouped = byBrand(rows);

    for (const [brand, items] of grouped) {
      if (brand) {
        checkPageBreak(ROW_HEIGHT + 2);
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(55, 65, 81);
        pdf.text(brand, xStart, y);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);
        y += ROW_HEIGHT;
      }

      // Table header
      checkPageBreak(HEADER_ROW_HEIGHT + items.length * ROW_HEIGHT);
      const headerY = y;
      pdf.setFontSize(FONT_SIZE_HEADER - 1);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.setFillColor(15, 118, 110);
      pdf.rect(xStart, y - 4, contentW, HEADER_ROW_HEIGHT, "F");
      pdf.text("SKU Code", xStart + 2, y + 2);
      pdf.text("Product Name", xStart + colWidths[0] + 2, y + 2);
      pdf.text("Attribute", xStart + colWidths[0] + colWidths[1] + 2, y + 2);
      pdf.text("Price", xStart + contentW - colWidths[3], y + 2, {
        align: "right",
      });
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      y += HEADER_ROW_HEIGHT;

      pdf.setFontSize(FONT_SIZE_BODY);
      for (const row of items) {
        checkPageBreak(ROW_HEIGHT);
        const lineY = y + 4;
        pdf.text(pdf.splitTextToSize(row.sku, colWidths[0] - 2)[0] || "—", xStart + 2, lineY);
        pdf.text(
          pdf.splitTextToSize(row.name, colWidths[1] - 2)[0] || "—",
          xStart + colWidths[0] + 2,
          lineY
        );
        pdf.text(
          pdf.splitTextToSize(row.attribute, colWidths[2] - 2)[0] || "—",
          xStart + colWidths[0] + colWidths[1] + 2,
          lineY
        );
        pdf.text(row.price, xStart + contentW - 2, lineY, { align: "right" });
        y += ROW_HEIGHT;
      }
      y += 4;
    }
    y += 8;
  }

  return pdf.output("blob");
}
