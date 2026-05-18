import "server-only";

import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { CheckoutActor, CheckoutInitiatePayload } from "@/types/checkout";
import { syncCheckoutAddressesToAddressBook } from "@/lib/checkout/syncCheckoutAddressesToAddressBook";
import { syncCheckoutUserMeta } from "@/lib/checkout/syncCheckoutUserMeta";

export async function getCheckoutWpToken(req: NextRequest): Promise<string | null> {
  const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const token = (nextAuthToken as { wpToken?: string } | null)?.wpToken;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

/** Sync Woo customer profile + saved address book after a successful logged-in checkout. */
export async function syncCheckoutCustomerAfterOrder(
  actor: CheckoutActor,
  payload: CheckoutInitiatePayload,
  wpToken: string | null | undefined
): Promise<void> {
  await syncCheckoutUserMeta(actor, payload);
  await syncCheckoutAddressesToAddressBook(actor, payload, wpToken);
}
