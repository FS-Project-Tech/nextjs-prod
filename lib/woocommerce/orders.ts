import "server-only";

import wcAPI from "./client";

export async function wooGetOrder<T = unknown>(orderId: string | number): Promise<T> {
  const { data } = await wcAPI.get<T>(`/orders/${orderId}`);
  return data;
}

export async function wooPutOrder<T = unknown>(
  orderId: string | number,
  body: Record<string, unknown>
): Promise<T> {
  const { data } = await wcAPI.put<T>(`/orders/${orderId}`, body);
  return data;
}
