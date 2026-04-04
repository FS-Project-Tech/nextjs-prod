import { NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { getAuthToken, getUserData } from "@/lib/auth-server";
import { userCanUsePayOnAccount } from "@/lib/checkout-payment-roles";

export const dynamic = "force-dynamic";

type Method = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export async function GET() {
  try {
    const methods: Method[] = [];
    const hasEway =
      Boolean(process.env.EWAY_API_KEY?.trim()) &&
      Boolean(process.env.EWAY_PASSWORD?.trim());

    if (hasEway) {
      methods.push({
        id: "eway",
        title: "Credit Card (eWAY)",
        description: "Secure card payment via eWAY.",
        enabled: true,
      });
    }

    let wcEnabledIds = new Set<string>();
    try {
      const gatewaysRes = await wcAPI.get("/payment_gateways");
      const gateways = Array.isArray(gatewaysRes.data)
        ? gatewaysRes.data
        : gatewaysRes.data
          ? [gatewaysRes.data]
          : [];
      for (const g of gateways) {
        if (
          g?.id &&
          (g.enabled === true || g.enabled === "yes" || g.enabled === 1)
        ) {
          wcEnabledIds.add(String(g.id));
        }
      }
    } catch {
      wcEnabledIds = new Set(["paypal", "bacs", "cod"]);
    }

    const token = await getAuthToken();
    let roles: string[] = [];
    if (token) {
      const user = await getUserData(token);
      roles = user?.roles ?? [];
    }
    const privileged = userCanUsePayOnAccount(roles);

    if (privileged) {
      if (wcEnabledIds.has("cod")) {
        methods.push({
          id: "cod",
          title: "Pay on Account (COD)",
          description: "Cash on delivery — invoiced / pay on account.",
          enabled: true,
        });
      }
    }

    if (methods.length === 0 && hasEway) {
      methods.push({
        id: "eway",
        title: "Credit Card (eWAY)",
        description: "Secure card payment via eWAY.",
        enabled: true,
      });
    }

    return NextResponse.json(
      { paymentMethods: methods, canUsePayOnAccount: privileged },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[payment-options]", e);
    return NextResponse.json(
      {
        paymentMethods: [
          {
            id: "eway",
            title: "Credit Card (eWAY)",
            description: "Secure card payment.",
            enabled: true,
          },
        ],
        canUsePayOnAccount: false,
      },
      { status: 200 }
    );
  }
}
