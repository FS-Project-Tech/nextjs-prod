export async function readResponseBodyText(res: Response): Promise<string> {
  // Single arrayBuffer read + UTF-8 decode avoids rare cases where `text()` returns empty despite a body.
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return text.replace(/^\uFEFF/, "");
}

function headerValueInsensitive(res: Response, name: string): string | null {
  const want = name.toLowerCase();
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() === want) return value;
  }
  return null;
}

export function pickCreateOrderKeyFromHeaders(res: Response): string | null {
  const encoded = headerValueInsensitive(res, "X-Order-Key");
  if (!encoded?.trim()) return null;
  try {
    const decoded = decodeURIComponent(encoded.trim());
    return decoded.trim() || null;
  } catch {
    return encoded.trim() || null;
  }
}

/** Parse ETag from create-order: W/"wc-checkout-{cod|redirect|ok}-{encodeURIComponent(orderId)}" */
function pickOrderIdFromCheckoutETag(res: Response): string | null {
  const raw = headerValueInsensitive(res, "ETag")?.trim();
  if (!raw) return null;
  const m = raw.match(/W\/"wc-checkout-(?:cod|redirect|ok)-([^"]+)"/i);
  if (!m?.[1]) return null;
  try {
    const decoded = decodeURIComponent(m[1]).trim();
    return decoded || null;
  } catch {
    const fallback = m[1].trim();
    return fallback || null;
  }
}

/** True when create-order signaled COD success via header or ETag (for empty-body recovery). */
export function checkoutResponseIndicatesCod(res: Response): boolean {
  if (headerValueInsensitive(res, "X-Checkout-Complete")?.trim().toLowerCase() === "cod") {
    return true;
  }
  const e = headerValueInsensitive(res, "ETag")?.trim() || "";
  return /W\/"wc-checkout-cod-/i.test(e);
}

export function pickCreateOrderIdFromHeaders(res: Response): string | null {
  const encoded = headerValueInsensitive(res, "X-Create-Order-Id");
  if (encoded) {
    const token = encoded.trim();
    if (token) {
      try {
        const decoded = decodeURIComponent(token);
        if (decoded) return decoded;
      } catch {
        /* ignore */
      }
      return token;
    }
  }
  const plain =
    headerValueInsensitive(res, "X-Order-Id")?.trim() ||
    headerValueInsensitive(res, "X-Checkout-Order-Id")?.trim();
  if (plain) return plain;
  return pickOrderIdFromCheckoutETag(res);
}

/**
 * Duplicate of JSON body (base64url) when proxies strip response bodies but leave headers.
 * @see app/api/checkout/create-order — `X-Checkout-Body`
 */
export function parseCheckoutMirrorFromResponse(res: Response): Record<string, unknown> | null {
  const raw = headerValueInsensitive(res, "X-Checkout-Body")?.trim();
  if (!raw) return null;
  try {
    const padLen = (4 - (raw.length % 4)) % 4;
    const padded = raw + "=".repeat(padLen);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function messageFromCreateOrderError(apiJson: Record<string, unknown>): string | null {
  const errField = apiJson.error;
  if (typeof errField === "string" && errField.trim()) return errField.trim();
  if (errField != null && typeof errField === "object" && "message" in errField) {
    const nested = (errField as { message?: unknown }).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  const msg = apiJson.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  const issues = apiJson.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { message?: unknown };
    if (typeof first?.message === "string" && first.message.trim()) return first.message.trim();
  }
  return null;
}
