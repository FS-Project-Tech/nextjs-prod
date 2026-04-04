/**
 * Lazy-loads html2pdf stack (jspdf + html2canvas) only when generating an invoice PDF.
 */
export async function downloadOrderInvoicePdf(
  filename: string,
  elementId = "invoice-content"
): Promise<void> {
  if (typeof window === "undefined") return;

  await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2pdfModule = await import("html2pdf.js");
  const html2pdf = (html2pdfModule.default || html2pdfModule) as (...args: unknown[]) => any;

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error("Invoice content not found");
  }

  const opt = {
    margin: [15, 15, 15, 15] as [number, number, number, number],
    filename,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
      ignoreElements: () => false,
      onclone: (clonedDoc: Document) => {
        const style = clonedDoc.createElement("style");
        style.textContent = `
              * {
                color-scheme: light !important;
              }
            `;
        clonedDoc.head.appendChild(style);
      },
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait" as const,
    },
  };

  await html2pdf().set(opt).from(element).save();
}
