import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Quote } from './types/quote';
import { formatPrice } from './format-utils';

/**
 * Generate PDF from quote data
 */
export async function generateQuotePDF(quote: Quote): Promise<Blob> {
  // Create a temporary container for the quote content
  const container = document.createElement('div');
  container.style.width = '210mm'; // A4 width
  container.style.padding = '20mm';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  
  // Build HTML content
  container.innerHTML = `
    <div style="margin-bottom: 30px;">
      <h1 style="font-size: 24px; margin: 0; color: #1f2937; font-weight: 700;">Quote ${quote.quote_number}</h1>
      <p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Date: ${new Date(quote.created_at).toLocaleDateString()}</p>
      ${quote.expires_at ? `<p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Expires: ${new Date(quote.expires_at).toLocaleDateString()}</p>` : ''}
      <p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Status: <strong>${quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}</strong></p>
    </div>
    
    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 18px; margin-bottom: 10px; color: #1f2937; font-weight: 600;">Customer Information</h2>
      <p style="margin: 5px 0; font-size: 14px;">${quote.user_name}</p>
      <p style="margin: 5px 0; font-size: 14px;">${quote.user_email}</p>
    </div>
    
    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 18px; margin-bottom: 15px; color: #1f2937; font-weight: 600;">Items</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
            <th style="text-align: left; padding: 10px; font-weight: 600; font-size: 14px;">Item</th>
            <th style="text-align: right; padding: 10px; font-weight: 600; font-size: 14px;">Quantity</th>
            <th style="text-align: right; padding: 10px; font-weight: 600; font-size: 14px;">Price</th>
            <th style="text-align: right; padding: 10px; font-weight: 600; font-size: 14px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${quote.items.map((item, index) => {
            const qty = item.qty || 1;
            const price = Number(item.price) || 0;
            return `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px; font-size: 14px;">
                  <div style="font-weight: 500;">${item.name}</div>
                  ${item.sku ? `<div style="font-size: 12px; color: #6b7280; margin-top: 2px;">SKU: ${item.sku}</div>` : ''}
                </td>
                <td style="text-align: right; padding: 10px; font-size: 14px;">${qty}</td>
                <td style="text-align: right; padding: 10px; font-size: 14px;">${formatPrice(price)}</td>
                <td style="text-align: right; padding: 10px; font-size: 14px; font-weight: 500;">${formatPrice(price * qty)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 18px; margin-bottom: 15px; color: #1f2937; font-weight: 600;">Pricing Summary</h2>
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
        <span>Subtotal:</span>
        <span>${formatPrice(quote.subtotal)}</span>
      </div>
      ${quote.shipping > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
          <span>Shipping:</span>
          <span>${formatPrice(quote.shipping)}</span>
        </div>
      ` : ''}
      ${quote.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #10b981;">
          <span>Discount:</span>
          <span>-${formatPrice(quote.discount)}</span>
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 2px solid #1f2937; font-size: 18px; font-weight: 600; margin-top: 10px;">
        <span>Total:</span>
        <span>${formatPrice(quote.total)}</span>
      </div>
    </div>
    
    ${quote.notes ? `
      <div style="margin-bottom: 30px;">
        <h2 style="font-size: 18px; margin-bottom: 10px; color: #1f2937; font-weight: 600;">Notes</h2>
        <p style="color: #6b7280; font-style: italic; font-size: 14px; line-height: 1.6;">${quote.notes}</p>
      </div>
    ` : ''}
    
    ${quote.status_history && quote.status_history.length > 0 ? `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <h2 style="font-size: 18px; margin-bottom: 15px; color: #1f2937; font-weight: 600;">Status History</h2>
        <div style="space-y: 10px;">
          ${quote.status_history
            .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
            .slice(0, 5) // Limit to last 5 entries for PDF
            .map((entry) => `
              <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span style="font-weight: 500; font-size: 14px;">${entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}</span>
                  <span style="color: #6b7280; font-size: 12px;">${new Date(entry.changed_at).toLocaleString()}</span>
                </div>
                ${entry.changed_by ? `<p style="color: #6b7280; font-size: 12px; margin: 2px 0;">Changed by: ${entry.changed_by}</p>` : ''}
                ${entry.reason ? `<p style="color: #6b7280; font-size: 12px; margin: 2px 0;">Reason: ${entry.reason}</p>` : ''}
                ${entry.notes ? `<p style="color: #6b7280; font-size: 12px; margin: 2px 0; font-style: italic;">${entry.notes}</p>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    ` : ''}
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
  `;
  
  // Append to body temporarily
  document.body.appendChild(container);
  
  try {
    // Generate canvas from HTML
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    
    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // Clean up
    document.body.removeChild(container);
    
    // Return as blob
    return pdf.output('blob');
  } catch (error) {
    // Clean up on error
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    throw error;
  }
}

