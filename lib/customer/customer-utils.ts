import { getWpBaseUrl } from "@/lib/auth";
import { wooGetCustomer, wooListCustomersByEmail } from "@/lib/woocommerce/customers";

const customerIdCache = new Map<string, { customerId: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function toIntCustomerId(id: unknown): number | null {
  if (id === null || id === undefined) return null;
  const num = typeof id === "string" ? parseInt(id, 10) : Number(id);
  return !isNaN(num) && num > 0 ? num : null;
}

function getCachedCustomerId(email: string): number | null {
  const cached = customerIdCache.get(email.toLowerCase());
  if (!cached) return null;
  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    customerIdCache.delete(email.toLowerCase());
    return null;
  }
  return cached.customerId;
}

function cacheCustomerId(email: string, customerId: number): void {
  customerIdCache.set(email.toLowerCase(), {
    customerId,
    timestamp: Date.now(),
  });
}

export function clearCustomerIdCache(email?: string): void {
  if (email) {
    customerIdCache.delete(email.toLowerCase());
  } else {
    customerIdCache.clear();
  }
}

async function getCustomerIdFromSession(token: string, wpBase: string): Promise<number | null> {
  try {
    const response = await fetch(`${wpBase}/wp-json/custom-auth/v1/session-info`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.ok) {
      const sessionPayload = await response.json();
      const customerId = toIntCustomerId(sessionPayload.customer_id);
      if (customerId) {
        return customerId;
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.debug("Session endpoint not available:", error);
    }
  }
  return null;
}

async function getCustomerIdByEmail(
  email: string,
  token: string,
  wpBase: string
): Promise<number | null> {
  try {
    try {
      const rows = await wooListCustomersByEmail(email);
      if (rows.length > 0) {
        const customerId = toIntCustomerId((rows[0] as { id?: unknown }).id);
        if (customerId) return customerId;
      }
    } catch {
      /* fall through to fetch */
    }

    const response = await fetch(
      `${wpBase}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const customers = await response.json();
      if (Array.isArray(customers) && customers.length > 0) {
        const customerId = toIntCustomerId(customers[0].id);
        if (customerId) return customerId;
      }
    }
  } catch (error) {
    console.error("Error fetching customer by email:", error);
  }
  return null;
}

export async function getCustomerById(customerId: number, token: string): Promise<any | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  try {
    const fromWoo = await wooGetCustomer(customerId);
    if (fromWoo) return fromWoo;

    const response = await fetch(`${wpBase}/wp-json/wc/v3/customers/${customerId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Error fetching customer by ID:", error);
  }
  return null;
}

export async function getCustomerByEmail(email: string, token: string): Promise<any | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  try {
    try {
      const rows = await wooListCustomersByEmail(email);
      if (rows.length > 0) {
        return rows[0];
      }
    } catch {
      /* fall through */
    }

    const response = await fetch(
      `${wpBase}/wp-json/wc/v3/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const customers = await response.json();
      if (Array.isArray(customers) && customers.length > 0) {
        return customers[0];
      }
    }
  } catch (error) {
    console.error("Error fetching customer by email:", error);
  }
  return null;
}

export async function getCustomerIdWithFallback(
  userEmail: string,
  token: string
): Promise<number | null> {
  if (!userEmail || !token) {
    return null;
  }

  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return null;
  }

  const emailLower = userEmail.toLowerCase();

  const cachedId = getCachedCustomerId(emailLower);
  if (cachedId) {
    return cachedId;
  }

  const sessionId = await getCustomerIdFromSession(token, wpBase);
  if (sessionId) {
    cacheCustomerId(emailLower, sessionId);
    return sessionId;
  }

  const emailId = await getCustomerIdByEmail(userEmail, token, wpBase);
  if (emailId) {
    cacheCustomerId(emailLower, emailId);
    return emailId;
  }

  return null;
}

export async function getCustomerData(userEmail: string, token: string): Promise<any | null> {
  if (!userEmail || !token) {
    return null;
  }

  const customerId = await getCustomerIdWithFallback(userEmail, token);

  if (customerId) {
    const customer = await getCustomerById(customerId, token);
    if (customer) {
      return customer;
    }
  }

  return await getCustomerByEmail(userEmail, token);
}
