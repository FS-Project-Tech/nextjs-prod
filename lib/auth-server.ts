"use server";

/**
 * Authentication Utilities (Server-Only)
 * Handles JWT token storage, validation, and cookie management
 * This file uses Next.js server-only APIs and should only be imported in Server Components or API routes
 */

import { cookies } from "next/headers";
import crypto from "crypto";
import { getWpBaseUrl } from "./wp-utils";

const SESSION_COOKIE_NAME = "session";
// Keep session 7 days so user stays logged in when tab is closed (WordPress JWT expiry should be ≥ this)
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const CSRF_COOKIE_NAME = "csrf-token";

/**
 * Get JWT token from cookie
 */
export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

/**
 * Generate CSRF token
 */
function generateCSRFToken(): string {
  return Buffer.from(crypto.randomBytes(32)).toString("base64url");
}

/**
 * Set JWT token in HttpOnly cookie with secure settings
 * Uses environment-aware cookie settings for proper functionality in both dev and prod
 */
export async function setAuthToken(token: string, csrfToken?: string): Promise<string> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  // Generate CSRF token if not provided
  const csrf = csrfToken || generateCSRFToken();

  // Environment-aware cookie settings
  // - Production: secure=true, sameSite=none (for cross-site requests with HTTPS)
  // - Development: secure=false, sameSite=lax (works on localhost without HTTPS)
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    maxAge: SESSION_MAX_AGE,
    path: "/",
  };

  // Set session token (HTTP-only)
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions);

  // Set CSRF token (not HTTP-only, for client-side validation)
  cookieStore.set(CSRF_COOKIE_NAME, csrf, {
    ...cookieOptions,
    httpOnly: false, // Accessible to JavaScript for CSRF validation
  });

  return csrf;
}

/**
 * Get CSRF token from cookie
 */
export async function getCSRFToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
}

/**
 * Validate CSRF token
 */
export async function validateCSRFToken(token: string): Promise<boolean> {
  const storedToken = await getCSRFToken();
  return storedToken !== null && storedToken === token;
}

/**
 * Clear auth token and CSRF cookies
 * Must use same settings as when setting cookies (for proper deletion)
 */
export async function clearAuthToken(): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  // Delete with same settings as when setting (for proper deletion)
  const deleteOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    maxAge: 0,
    path: "/",
  };

  cookieStore.set(SESSION_COOKIE_NAME, "", deleteOptions);
  cookieStore.set(CSRF_COOKIE_NAME, "", {
    ...deleteOptions,
    httpOnly: false,
  });
}

/**
 * Validate JWT token with WordPress
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const wpBase = getWpBaseUrl();
    if (!wpBase) return false;

    // Add timeout to prevent hanging requests
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = 3000; // Reduced to 3 second timeout for validation
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(`${wpBase}/wp-json/jwt-auth/v1/token/validate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: controller?.signal,
      }).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });

      if (!response.ok && process.env.NODE_ENV === "development") {
        const body = await response.text();
        console.warn(
          "[auth] WordPress token/validate returned",
          response.status,
          "- If you get auto logout on refresh, add the Authorization header pass-through in WordPress .htaccess (see docs/JWT_WORDPRESS_SETUP.md).",
          body ? `Body: ${body.slice(0, 120)}` : ""
        );
      }

      return response.ok;
    } catch (fetchError: unknown) {
      // Handle timeout and connection errors gracefully
      const fe = fetchError as Error & { code?: string };
      const message = typeof fe?.message === "string" ? fe.message : "";
      const name = fe?.name;
      const code = fe?.code;
      const isTimeout =
        name === "AbortError" ||
        code === "UND_ERR_CONNECT_TIMEOUT" ||
        message.includes("timeout") ||
        message.includes("aborted");
      if (isTimeout) {
        // Timeout/connection error - treat as invalid token
        return false;
      }
      throw fetchError;
    }
  } catch (error: unknown) {
    // Only log non-timeout errors
    const err = error as Error & { code?: string };
    const name = err?.name;
    const code = err?.code;
    const message = typeof err?.message === "string" ? err.message : "";
    const isTimeout =
      name === "AbortError" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      message.includes("timeout") ||
      message.includes("aborted");
    if (!isTimeout) {
      console.error("Token validation error:", error);
    }
    return false;
  }
}

/**
 * Get user data from WordPress using JWT token
 */
export async function getUserData(token: string): Promise<any | null> {
  try {
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      console.error("WordPress base URL not configured");
      return null;
    }

    // Add timeout to prevent hanging requests
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutMs = 5000; // Reduced to 5 second timeout (was 10s)
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller?.signal,
        // Don't send credentials for cross-origin WordPress requests
        // WordPress handles its own authentication via Bearer token
      }).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });

      if (!response.ok) {
        // Don't log 401/403 as errors - these are expected for invalid tokens
        if (response.status !== 401 && response.status !== 403) {
          console.error("Failed to fetch user data:", response.status, response.statusText);
        }
        return null;
      }

      // Check if response body exists before reading (prevents getReader error on null)
      if (!response.body) {
        return null;
      }

      const user = await response.json();

      // Ensure we have required fields
      if (!user || !user.id) {
        console.error("Invalid user data received:", user);
        return null;
      }

      // Extract name with comprehensive fallback chain
      // WordPress API may return name, display_name, or first_name/last_name
      let userName = user.name || user.display_name;

      // If no name or display_name, try to construct from first_name + last_name
      if (!userName && (user.first_name || user.last_name)) {
        const firstName = user.first_name || "";
        const lastName = user.last_name || "";
        userName = `${firstName} ${lastName}`.trim() || null;
      }

      // Final fallback to nicename or user_login (but prefer empty over username)
      // Only use username as last resort if nothing else is available
      if (!userName) {
        userName = user.nicename || user.user_login || "";
      }

      return {
        id: user.id,
        email: user.email || user.user_email,
        name: userName,
        username: user.slug || user.user_login || user.nicename,
        roles: user.roles || [],
      };
    } catch (fetchError: any) {
      // Handle timeout and connection errors gracefully
      if (
        fetchError?.name === "AbortError" ||
        fetchError?.code === "UND_ERR_CONNECT_TIMEOUT" ||
        fetchError?.message?.includes("timeout") ||
        fetchError?.message?.includes("aborted")
      ) {
        // Timeout/connection error - don't log as error
        return null;
      }
      throw fetchError;
    }
  } catch (error: any) {
    // Only log non-timeout errors
    if (
      error?.name !== "AbortError" &&
      error?.code !== "UND_ERR_CONNECT_TIMEOUT" &&
      !error?.message?.includes("timeout") &&
      !error?.message?.includes("aborted")
    ) {
      console.error("Get user data error:", error);
    }
    return null;
  }
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  username: string;
  roles: string[];
}

export interface AuthSession {
  token: string;
  user: AuthenticatedUser;
  customer?: any | null;
}

function normalizeJwtUser(data: any): AuthenticatedUser {
  // Extract name with comprehensive fallback chain (same as getUserData)
  let userName = data?.name || data?.display_name;

  // If no name or display_name, try to construct from first_name + last_name
  if (!userName && (data?.first_name || data?.last_name)) {
    const firstName = data?.first_name || "";
    const lastName = data?.last_name || "";
    userName = `${firstName} ${lastName}`.trim() || null;
  }

  // Final fallback to nicename or user_login
  if (!userName) {
    userName = data?.nicename || data?.user_login || "";
  }

  return {
    id: Number(data?.id || data?.user_id || 0),
    email: data?.email || data?.user_email || "",
    name: userName,
    username: data?.nicename || data?.username || data?.slug || data?.user_login || "",
    roles: Array.isArray(data?.roles) ? data.roles : [],
  };
}

async function fetchCustomerByEmail(email: string, token: string): Promise<any | null> {
  if (!email) return null;
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

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

  if (!response.ok) {
    return null;
  }

  const customers = await response.json();
  return Array.isArray(customers) && customers.length > 0 ? customers[0] : null;
}

export async function authenticateUser(username: string, password: string): Promise<AuthSession> {
  const wpBase = getWpBaseUrl();

  if (!wpBase) {
    throw new Error("WordPress URL is not configured.");
  }

  const jwtResponse = await fetch(`${wpBase}/wp-json/jwt-auth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
    // Don't include credentials for WordPress login (it's a different domain)
    // WordPress will set its own cookies if needed
  });

  const rawBody = await jwtResponse.text();
  let jwtData: { token?: string; message?: string; user?: any; data?: any } = {};
  try {
    jwtData = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    if (!jwtResponse.ok && rawBody.trim().toLowerCase().startsWith("<!")) {
      throw new Error(
        "Login service returned an error page. Please ensure the WordPress JWT endpoint is enabled and the REST API is working."
      );
    }
    throw new Error("Invalid response from login service.");
  }

  if (!jwtResponse.ok || !jwtData?.token) {
    const msg = jwtData?.message || "";
    if (
      msg.toLowerCase().includes("jwt is not configured properly") ||
      msg.toLowerCase().includes("contact the admin")
    ) {
      throw new Error(
        "JWT is not configured properly on the server. Please contact the site admin to set JWT_AUTH_SECRET_KEY in wp-config.php."
      );
    }
    throw new Error(msg || "Invalid credentials.");
  }

  const rawUser = jwtData?.user || jwtData?.data || jwtData;
  let user = normalizeJwtUser(rawUser);

  // Always fetch full user from WordPress (wp/v2/users/me) so name and roles are correct
  // for all role types (Customer, NDIS Approved, Health Professional, etc.). JWT payload
  // alone often has minimal or wrong data for non-Customer roles.
  const fetchedUser = await getUserData(jwtData.token);
  if (fetchedUser) {
    user = {
      id: fetchedUser.id,
      email: fetchedUser.email,
      name: fetchedUser.name,
      username: fetchedUser.username,
      roles: fetchedUser.roles || [],
    };
  }

  const customer = await fetchCustomerByEmail(user.email, jwtData.token);

  return {
    token: jwtData.token,
    user,
    customer,
  };
}

interface CreateWooUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

export async function createWooUser(input: CreateWooUserInput) {
  const wpBase = getWpBaseUrl();

  if (!wpBase) {
    throw new Error("WordPress URL is not configured.");
  }

  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("WooCommerce credentials are missing.");
  }

  const wcUrl = new URL(`${wpBase}/wp-json/wc/v3/customers`);
  wcUrl.searchParams.set("consumer_key", consumerKey);
  wcUrl.searchParams.set("consumer_secret", consumerSecret);

  const response = await fetch(wcUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      email: input.email,
      username: input.username || input.email,
      password: input.password,
      first_name: input.firstName || "",
      last_name: input.lastName || "",
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || "Registration failed.");
  }

  return {
    id: data?.id,
    email: data?.email,
    username: data?.username,
    firstName: data?.first_name,
    lastName: data?.last_name,
  };
}
