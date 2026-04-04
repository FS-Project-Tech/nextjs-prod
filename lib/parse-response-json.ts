/**
 * Parse JSON from a fetch Response without throwing on empty/non-JSON bodies.
 * `response.json()` throws SyntaxError: "Unexpected end of JSON input" when body is empty.
 */
export async function parseResponseJson<T = unknown>(
  response: Response
): Promise<{ ok: boolean; data: T | null; rawText: string }> {
  const rawText = await response.text().catch(() => "");
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: response.ok, data: null, rawText: "" };
  }
  try {
    return { ok: response.ok, data: JSON.parse(trimmed) as T, rawText };
  } catch {
    return { ok: response.ok, data: null, rawText };
  }
}
