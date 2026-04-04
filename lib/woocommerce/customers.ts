import "server-only";

import wcAPI from "./client";

export async function wooListCustomersByEmail(email: string): Promise<any[]> {
  const { data } = await wcAPI.get<any[]>("/customers", {
    params: { email },
  });
  return Array.isArray(data) ? data : [];
}

export async function wooGetCustomer(customerId: number): Promise<any | null> {
  try {
    const { data } = await wcAPI.get(`/customers/${customerId}`);
    return data ?? null;
  } catch {
    return null;
  }
}
