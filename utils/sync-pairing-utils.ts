export const ADD_DEVICE_PAYLOAD_PEM_BEGIN = '-----BEGIN FAKTORO ADD DEVICE PAYLOAD-----';
export const ADD_DEVICE_PAYLOAD_PEM_END = '-----END FAKTORO ADD DEVICE PAYLOAD-----';
export const RECOVERY_PAYLOAD_PEM_BEGIN = '-----BEGIN FAKTORO RECOVERY PAYLOAD-----';
export const RECOVERY_PAYLOAD_PEM_END = '-----END FAKTORO RECOVERY PAYLOAD-----';
export const PAYLOAD_PEM_LINE_WIDTH = 64;

export type ParsedRecoveryPayload = {
  deviceId: string;
  recoveryToken: string;
  serverBaseUrl: string;
  instanceId?: string;
  allowPlaintext?: boolean;
  instanceKey?: string;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractRecoveryPayload(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  try {
    const parsedUrl = new URL(raw);
    const payload = parsedUrl.searchParams.get('payload');
    if (payload?.trim()) return payload;
  } catch {
    // not a URL
  }
  return raw;
}

export function encodePayloadPem(rawJson: string, pemBegin: string, pemEnd: string): string {
  const base64Payload = toBase64(rawJson);
  const lines: string[] = [];
  for (let i = 0; i < base64Payload.length; i += PAYLOAD_PEM_LINE_WIDTH) {
    lines.push(base64Payload.slice(i, i + PAYLOAD_PEM_LINE_WIDTH));
  }
  return `${pemBegin}\n${lines.join('\n')}\n${pemEnd}`;
}

export function parseJsonFromRawOrPem(
  raw: string,
  pemBegin: string,
  pemEnd: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // try PEM
  }
  const decoded = decodePayloadPem(raw, pemBegin, pemEnd);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseRecoveryPayloadFromRawOrPem(raw: string): ParsedRecoveryPayload | null {
  const parsed = parseJsonFromRawOrPem(raw, RECOVERY_PAYLOAD_PEM_BEGIN, RECOVERY_PAYLOAD_PEM_END);
  if (!parsed) return null;

  const deviceId = typeof parsed.deviceId === 'string' ? parsed.deviceId.trim() : '';
  const recoveryToken = typeof parsed.recoveryToken === 'string' ? parsed.recoveryToken.trim() : '';
  const serverBaseUrl = typeof parsed.serverBaseUrl === 'string' ? parsed.serverBaseUrl.trim() : '';
  const instanceId = typeof parsed.instanceId === 'string' ? parsed.instanceId.trim() : '';
  const instanceKey = typeof parsed.instanceKey === 'string' ? parsed.instanceKey.trim() : '';
  const allowPlaintext =
    typeof parsed.allowPlaintext === 'boolean' ? parsed.allowPlaintext : undefined;

  if (!deviceId || !recoveryToken || !serverBaseUrl) {
    return null;
  }

  return {
    deviceId,
    recoveryToken,
    serverBaseUrl,
    instanceId: instanceId || undefined,
    allowPlaintext,
    instanceKey: instanceKey || undefined,
  };
}

function decodePayloadPem(input: string, pemBegin: string, pemEnd: string): string | null {
  if (!input.includes(pemBegin) || !input.includes(pemEnd)) return null;
  const body = input.replace(pemBegin, '').replace(pemEnd, '');
  const compactBase64 = body.replace(/\s+/g, '');
  if (!compactBase64) return null;
  try {
    return fromBase64(compactBase64);
  } catch {
    return null;
  }
}

function toBase64(value: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf-8').toString('base64');
  if (typeof globalThis.btoa === 'function')
    return globalThis.btoa(unescape(encodeURIComponent(value)));
  throw new Error('Base64 encoding is not available');
}

function fromBase64(value: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf-8');
  if (typeof globalThis.atob === 'function')
    return decodeURIComponent(escape(globalThis.atob(value)));
  throw new Error('Base64 decoding is not available');
}

export function syncDebugLog(step: string, details?: Record<string, unknown>) {
  const stamp = new Date().toISOString();
  if (details) {
    console.log(`[sync][${stamp}] ${step}`, details);
  } else {
    console.log(`[sync][${stamp}] ${step}`);
  }
}
