type LogMeta = Record<string, unknown>;

function safe(meta?: LogMeta): LogMeta | undefined {
  if (!meta) return undefined;
  const out: LogMeta = { ...meta };
  delete out.authorization;
  delete out.password;
  delete out.token;
  delete out.apiKey;
  delete out.secret;
  return out;
}

export function logInfo(message: string, meta?: LogMeta): void {
  console.info(`[checkout] ${message}`, safe(meta) ?? "");
}

export function logWarn(message: string, meta?: LogMeta): void {
  console.warn(`[checkout] ${message}`, safe(meta) ?? "");
}

export function logError(message: string, meta?: LogMeta): void {
  console.error(`[checkout] ${message}`, safe(meta) ?? "");
}
