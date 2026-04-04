export async function readResponseBodyText(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function headerValueInsensitive(res: Response, name: string): string | null {
  const want = name.toLowerCase();
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() === want) return value;
  }
  return null;
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
  const plain = headerValueInsensitive(res, "X-Order-Id")?.trim();
  return plain || null;
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
