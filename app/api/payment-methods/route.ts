import { NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";

export async function GET() {
  try {
    const api = process.env.WC_API_URL || '';
    const u = new URL(api);
    const wpBase = `${u.protocol}//${u.host}`;
    const enabledMethods: Array<{ id: string; title: string; description?: string; enabled: boolean }> = [];
    const commonGateways = [
      { id: 'bacs', title: 'On account', description: 'Make your payment directly into our bank account.' },
      { id: 'paypal', title: 'PayPal', description: 'Pay via PayPal; you can pay with your credit card if you don\'t have a PayPal account.' },
    ];
    const allowedIds = new Set(['bacs', 'paypal']);

    try {
      const gatewaysRes = await wcAPI.get('/payment_gateways');
      const gateways = Array.isArray(gatewaysRes.data) ? gatewaysRes.data : (gatewaysRes.data ? [gatewaysRes.data] : []);
      
      if (gateways.length > 0) {
        for (const gateway of gateways) {
          if (!allowedIds.has(gateway.id)) continue;
          if (gateway.enabled === true || gateway.enabled === 'yes' || gateway.enabled === 1) {
            const g = commonGateways.find(c => c.id === gateway.id);
            enabledMethods.push({
              id: gateway.id,
              title: g?.title ?? gateway.title ?? gateway.method_title ?? gateway.id,
              description: gateway.description || g?.description || '',
              enabled: true,
            });
          }
        }
        
        if (enabledMethods.length > 0) {
          return NextResponse.json({ paymentMethods: enabledMethods });
        }
      }
    } catch {
    }

    try {
      const optionsRes = await fetch(`${wpBase}/wp-json/wp/v2/options`, { cache: 'no-store' });
      if (optionsRes.ok) {
        const options = await optionsRes.json();
        for (const gateway of commonGateways) {
          const gatewayOptionKey = `woocommerce_${gateway.id}_settings`;
          const gatewayOption = options[gatewayOptionKey];
          
          if (gatewayOption) {
            try {
              let settings: any;
              if (typeof gatewayOption === 'string') {
                try {
                  settings = JSON.parse(gatewayOption);
                } catch {
                  if (gatewayOption.includes('enabled') && (gatewayOption.includes('yes') || gatewayOption.includes('true'))) {
                    settings = { enabled: 'yes' };
                  }
                }
              } else {
                settings = gatewayOption;
              }
              if (settings && (settings.enabled === 'yes' || settings.enabled === true || settings.enabled === '1')) {
                enabledMethods.push({
                  id: gateway.id,
                  title: settings.title || gateway.title,
                  description: settings.description || gateway.description,
                  enabled: true,
                });
              }
            } catch {
              const optionStr = String(gatewayOption);
              if ((optionStr.includes('"enabled":"yes"') || 
                   optionStr.includes('"enabled":true') || 
                   optionStr.includes('enabled";s:3:"yes"') ||
                   optionStr.includes('enabled";b:1')) && 
                  !optionStr.includes('"enabled":"no"') &&
                  !optionStr.includes('"enabled":false')) {
                enabledMethods.push({
                  id: gateway.id,
                  title: gateway.title,
                  description: gateway.description,
                  enabled: true,
                });
              }
            }
          }
        }
        const gatewayOrder = options.woocommerce_gateway_order;
        if (gatewayOrder && typeof gatewayOrder === 'string') {
          const orderArray = gatewayOrder.split(',');
          for (const gatewayId of orderArray) {
            const trimmedId = gatewayId.trim();
            if (trimmedId && allowedIds.has(trimmedId) && !enabledMethods.find(m => m.id === trimmedId)) {
              const gateway = commonGateways.find(g => g.id === trimmedId);
              if (gateway) {
                enabledMethods.push({
                  id: gateway.id,
                  title: gateway.title,
                  description: gateway.description,
                  enabled: true,
                });
              }
            }
          }
        }
      }
    } catch {}

    if (enabledMethods.length > 0) {
      const filtered = enabledMethods.filter(m => allowedIds.has(m.id));
      return NextResponse.json({ paymentMethods: filtered });
    }
    return NextResponse.json({
      paymentMethods: commonGateways.map(g => ({ ...g, enabled: true }))
    });
    
  } catch {
    return NextResponse.json({
      paymentMethods: [
        { id: 'bacs', title: 'On account', description: 'Make your payment directly into our bank account.', enabled: true },
        { id: 'paypal', title: 'PayPal', description: 'Pay via PayPal.', enabled: true },
      ]
    });
  }
}
