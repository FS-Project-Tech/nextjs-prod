/**
 * Access Token System for Cart Pages
 * Prevents direct URL access - users must go through proper flow
 */

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const TOKEN_STORAGE_KEY = "access_token";

interface TokenData {
  token: string;
  expiresAt: number;
  type: "cart";
}

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    // Fallback for SSR
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate an access token for cart
 */
export function generateAccessToken(type: "cart"): string {
  if (typeof window === "undefined") return "";
  
  const token = generateToken();
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  
  const tokenData: TokenData = {
    token,
    expiresAt,
    type,
  };
  
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
  } catch (e) {
    console.error("Failed to store access token:", e);
  }
  
  return token;
}

/**
 * Validate an access token
 */
export function validateAccessToken(token: string | null, requiredType: "cart"): boolean {
  if (typeof window === "undefined") return false;
  if (!token) return false;
  
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return false;
    
    const tokenData: TokenData = JSON.parse(stored);
    
    // Check if token matches
    if (tokenData.token !== token) return false;
    
    // Check if token has expired
    if (Date.now() > tokenData.expiresAt) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return false;
    }
    
    // Check if token type matches
    if (tokenData.type !== requiredType) return false;
    
    return true;
  } catch (e) {
    console.error("Failed to validate access token:", e);
    return false;
  }
}

/**
 * Get the current stored token
 */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;
    
    const tokenData: TokenData = JSON.parse(stored);
    
    // Check if expired
    if (Date.now() > tokenData.expiresAt) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    
    return tokenData.token;
  } catch (e) {
    return null;
  }
}

/**
 * Clear the stored token
 */
export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear access token:", e);
  }
}

/**
 * Generate cart URL with token
 */
export function getCartUrl(): string {
  const token = generateAccessToken("cart");
  return `/cart?token=${token}`;
}

