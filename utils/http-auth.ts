import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';

export type HttpAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'api_key'; headerName: string; value: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'oauth2_cc'; tokenUrl: string; clientId: string; clientSecret: string; scope: string };

export type HttpAuthType = HttpAuth['type'];

export const HTTP_AUTH_TYPES: HttpAuthType[] = ['none', 'bearer', 'api_key', 'basic', 'oauth2_cc'];

export type HttpAuthSecrets = {
  bearerToken?: string;
  apiKeyValue?: string;
  basicPassword?: string;
  oauth2ClientSecret?: string;
};

type CachedToken = { accessToken: string; expiresAt: number };

const DEFAULT_TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_HTTP_ATTEMPTS = 2;

function getSecureStoreModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store');
  } catch {
    throw new Error('expo-secure-store is not installed.');
  }
}

async function getSecureValue(key: string): Promise<string | null> {
  const SecureStore = getSecureStoreModule();
  return SecureStore.getItemAsync(key);
}

async function setSecureValue(key: string, value: string | null): Promise<void> {
  const SecureStore = getSecureStoreModule();
  if (value?.trim()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function isSecureOrLocalHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalhost);
  } catch {
    return false;
  }
}

export function parseSecureOrLocalHttpUrl(value: string, context: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${context}: invalid URL`);
  }

  if (!isSecureOrLocalHttpUrl(value)) {
    throw new Error(`${context}: HTTPS is required`);
  }

  return parsed;
}

export function extractHttpAuthSecrets(auth: HttpAuth): HttpAuthSecrets {
  switch (auth.type) {
    case 'bearer':
      return { bearerToken: auth.token };
    case 'api_key':
      return { apiKeyValue: auth.value };
    case 'basic':
      return { basicPassword: auth.password };
    case 'oauth2_cc':
      return { oauth2ClientSecret: auth.clientSecret };
    default:
      return {};
  }
}

export function stripHttpAuthSecrets(auth: HttpAuth): HttpAuth {
  if (auth.type === 'bearer') return { ...auth, token: '' };
  if (auth.type === 'api_key') return { ...auth, value: '' };
  if (auth.type === 'basic') return { ...auth, password: '' };
  if (auth.type === 'oauth2_cc') return { ...auth, clientSecret: '' };
  return auth;
}

export function mergeHttpAuthSecrets(auth: HttpAuth, secrets: HttpAuthSecrets): HttpAuth {
  if (auth.type === 'bearer') return { ...auth, token: secrets.bearerToken ?? auth.token };
  if (auth.type === 'api_key') return { ...auth, value: secrets.apiKeyValue ?? auth.value };
  if (auth.type === 'basic') return { ...auth, password: secrets.basicPassword ?? auth.password };
  if (auth.type === 'oauth2_cc') {
    return { ...auth, clientSecret: secrets.oauth2ClientSecret ?? auth.clientSecret };
  }
  return auth;
}

export function hasHttpAuthSecretFields(auth: HttpAuth): boolean {
  switch (auth.type) {
    case 'bearer':
      return !!auth.token.trim();
    case 'api_key':
      return !!auth.value.trim();
    case 'basic':
      return !!auth.password.trim();
    case 'oauth2_cc':
      return !!auth.clientSecret.trim();
    default:
      return false;
  }
}

export async function loadHttpAuthSecrets(storageKey: string): Promise<HttpAuthSecrets> {
  const raw = await getSecureValue(storageKey);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as HttpAuthSecrets;
  } catch {
    return {};
  }
}

export async function saveHttpAuthSecrets(
  storageKey: string,
  secrets: HttpAuthSecrets,
): Promise<void> {
  const hasSecrets = Object.values(secrets).some((value) => !!value?.trim());
  await setSecureValue(storageKey, hasSecrets ? JSON.stringify(secrets) : null);
}

export async function clearHttpAuthSecrets(storageKey: string): Promise<void> {
  await setSecureValue(storageKey, null);
}

export async function clearHttpAuthCachedToken(
  tokenCacheStorageKey: string,
  legacyConfigStorageKey?: string,
): Promise<void> {
  await setSecureValue(tokenCacheStorageKey, null);
  if (legacyConfigStorageKey) {
    await setConfigValue(legacyConfigStorageKey, null);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    /network request failed/i.test(error.message) ||
    /timed out/i.test(error.message)
  );
}

function createHttpError(
  status: number,
  statusText: string,
  body: string,
  context: string,
): Error & { httpStatus: number } {
  const suffix = body ? ` - ${body.slice(0, 180)}` : '';
  return Object.assign(new Error(`${context} failed: ${status} ${statusText}${suffix}`), {
    httpStatus: status,
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw Object.assign(new Error('Request timed out.'), { networkError: true });
    }
    if (error instanceof Error) {
      throw Object.assign(new Error(error.message), { networkError: true });
    }
    throw Object.assign(new Error('Network request failed.'), { networkError: true });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeHttpRequest(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; context: string; maxAttempts: number },
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, options.timeoutMs);
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const httpError = createHttpError(
          response.status,
          response.statusText,
          bodyText,
          options.context,
        );
        if (attempt < options.maxAttempts && isRetryableStatus(response.status)) {
          lastError = httpError;
          continue;
        }
        throw httpError;
      }
      return response;
    } catch (error) {
      if (attempt < options.maxAttempts && isRetryableNetworkError(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.context} failed.`);
}

async function loadCachedOAuth2Token(
  tokenCacheStorageKey: string,
  legacyConfigStorageKey?: string,
): Promise<CachedToken | null> {
  let raw = await getSecureValue(tokenCacheStorageKey);
  if (!raw && legacyConfigStorageKey) {
    const legacyRaw = await getConfigValue(legacyConfigStorageKey);
    if (legacyRaw) {
      raw = legacyRaw;
      await setSecureValue(tokenCacheStorageKey, legacyRaw);
      await setConfigValue(legacyConfigStorageKey, null);
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedToken;
  } catch {
    return null;
  }
}

async function saveCachedOAuth2Token(
  tokenCacheStorageKey: string,
  token: CachedToken,
): Promise<void> {
  await setSecureValue(tokenCacheStorageKey, JSON.stringify(token));
}

async function getOAuth2ClientCredentialsToken(
  auth: Extract<HttpAuth, { type: 'oauth2_cc' }>,
  options: {
    tokenCacheStorageKey: string;
    legacyConfigStorageKey?: string;
    timeoutMs?: number;
    maxAttempts?: number;
  },
): Promise<string> {
  const cached = await loadCachedOAuth2Token(
    options.tokenCacheStorageKey,
    options.legacyConfigStorageKey,
  );
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  parseSecureOrLocalHttpUrl(auth.tokenUrl, 'OAuth2 token URL');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    ...(auth.scope ? { scope: auth.scope } : {}),
  });

  const response = await executeHttpRequest(
    auth.tokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    {
      timeoutMs: options.timeoutMs ?? DEFAULT_TOKEN_REQUEST_TIMEOUT_MS,
      maxAttempts: options.maxAttempts ?? DEFAULT_HTTP_ATTEMPTS,
      context: 'OAuth2 token request',
    },
  );

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('OAuth2 token request failed: missing access_token');
  }

  const expiresIn = json.expires_in ?? 3600;
  await saveCachedOAuth2Token(options.tokenCacheStorageKey, {
    accessToken: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return json.access_token;
}

export async function resolveHttpAuthHeaders(
  auth: HttpAuth,
  options: {
    tokenCacheStorageKey: string;
    legacyTokenCacheConfigKey?: string;
    tokenRequestTimeoutMs?: number;
    maxHttpAttempts?: number;
  },
): Promise<Record<string, string>> {
  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${auth.token}` };
    case 'api_key':
      return { [auth.headerName]: auth.value };
    case 'basic': {
      const encoded = btoa(`${auth.username}:${auth.password}`);
      return { Authorization: `Basic ${encoded}` };
    }
    case 'oauth2_cc': {
      const token = await getOAuth2ClientCredentialsToken(auth, {
        tokenCacheStorageKey: options.tokenCacheStorageKey,
        legacyConfigStorageKey: options.legacyTokenCacheConfigKey,
        timeoutMs: options.tokenRequestTimeoutMs,
        maxAttempts: options.maxHttpAttempts,
      });
      return { Authorization: `Bearer ${token}` };
    }
    default:
      return {};
  }
}
