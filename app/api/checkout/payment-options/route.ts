import { NextResponse } from "next/server";
import { getPaymentMethodOptionLabel } from "@/lib/checkout/paymentDisplay";

export const dynamic = "force-dynamic";

type Method = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

const onAccountMethod: Method = {
  id: "cod",
  title: getPaymentMethodOptionLabel({ id: "cod", title: "" }),
  description: "Pay later via your account.",
  enabled: true,
};

export async function GET() {
  try {
    const hasEway =
      Boolean(process.env.EWAY_API_KEY?.trim()) && Boolean(process.env.EWAY_PASSWORD?.trim());

    const methods: Method[] = [onAccountMethod];
    if (hasEway) {
      methods.unshift({
        id: "eway",
        title: "Credit Card (eWAY)",
        description: "Secure card payment via eWAY.",
        enabled: true,
      });
    }

    return NextResponse.json(
      { paymentMethods: methods, canUsePayOnAccount: true },
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
          onAccountMethod,
        ],
        canUsePayOnAccount: true,
      },
      { status: 200 }
    );
  }
}
