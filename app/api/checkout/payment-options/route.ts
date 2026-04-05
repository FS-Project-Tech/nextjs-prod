import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Method = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export async function GET() {
  try {
    const hasEway =
      Boolean(process.env.EWAY_API_KEY?.trim()) && Boolean(process.env.EWAY_PASSWORD?.trim());

    const methods: Method[] = hasEway
      ? [
          {
            id: "eway",
            title: "Credit Card (eWAY)",
            description: "Secure card payment via eWAY.",
            enabled: true,
          },
        ]
      : [];

    return NextResponse.json(
      { paymentMethods: methods, canUsePayOnAccount: false },
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
