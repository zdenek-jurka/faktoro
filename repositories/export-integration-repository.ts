import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';

const CONFIG_KEY = 'export_integrations.list';
const LEGACY_TOKEN_CACHE_PREFIX = 'oauth2_token_cache.';
const TOKEN_CACHE_PREFIX = 'export_integration_oauth2_token.';
const SECRET_STORE_PREFIX = 'export_integration_secret.';
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const WEBHOOK_REQUEST_TIMEOUT_MS = 20_000;
const MAX_HTTP_ATTEMPTS = 2;
const TIMESHEET_XML_NAMESPACE = 'https://faktoro.app/xml/timesheet/1.0';
const INVOICE_XML_NAMESPACE = 'https://faktoro.app/xml/invoice/1.0';
const XSLT_NAMESPACE = 'http://www.w3.org/1999/XSL/Transform';

export type ExportIntegrationDocumentType = 'timesheet' | 'invoice';

export type WebhookAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'api_key'; headerName: string; value: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'oauth2_cc'; tokenUrl: string; clientId: string; clientSecret: string; scope: string };

export type WebhookHeader = { key: string; value: string };

export type ExportIntegrationDelivery =
  | { type: 'share' }
  | { type: 'clipboard' }
  | {
      type: 'webhook';
      url: string;
      method: 'POST' | 'PUT' | 'PATCH';
      contentType: string;
      auth: WebhookAuth;
      headers: WebhookHeader[];
    };

export type ExportIntegration = {
  id: string;
  name: string;
  description: string;
  documentType: ExportIntegrationDocumentType;
  delivery: ExportIntegrationDelivery;
  xslt: string;
  createdAt: number;
};

// --- Token cache ---

type CachedToken = { accessToken: string; expiresAt: number };
type ExportIntegrationSecrets = {
  bearerToken?: string;
  apiKeyValue?: string;
  basicPassword?: string;
  oauth2ClientSecret?: string;
};

function getSecureStoreModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store');
  } catch {
    throw new Error('expo-secure-store is not installed.');
  }
}

function getClipboardModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard');
    if (typeof Clipboard?.setStringAsync !== 'function') {
      throw new Error('Clipboard module missing setStringAsync');
    }
    return Clipboard;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ExpoClipboard|native module/i.test(message)) {
      throw new Error(
        'Clipboard export is unavailable because the Expo Clipboard native module is missing. Rebuild and reinstall the app, then try again.',
      );
    }
    throw error;
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

function getTokenCacheStorageKey(integrationId: string): string {
  return `${TOKEN_CACHE_PREFIX}${integrationId}`;
}

function getSecretStorageKey(integrationId: string): string {
  return `${SECRET_STORE_PREFIX}${integrationId}`;
}

async function loadIntegrationSecrets(integrationId: string): Promise<ExportIntegrationSecrets> {
  const raw = await getSecureValue(getSecretStorageKey(integrationId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ExportIntegrationSecrets;
  } catch {
    return {};
  }
}

async function saveIntegrationSecrets(
  integrationId: string,
  secrets: ExportIntegrationSecrets,
): Promise<void> {
  const hasSecrets = Object.values(secrets).some((value) => !!value?.trim());
  await setSecureValue(
    getSecretStorageKey(integrationId),
    hasSecrets ? JSON.stringify(secrets) : null,
  );
}

async function clearIntegrationSecrets(integrationId: string): Promise<void> {
  await setSecureValue(getSecretStorageKey(integrationId), null);
}

function extractDeliverySecrets(delivery: ExportIntegrationDelivery): ExportIntegrationSecrets {
  if (delivery.type !== 'webhook') return {};

  switch (delivery.auth.type) {
    case 'bearer':
      return { bearerToken: delivery.auth.token };
    case 'api_key':
      return { apiKeyValue: delivery.auth.value };
    case 'basic':
      return { basicPassword: delivery.auth.password };
    case 'oauth2_cc':
      return { oauth2ClientSecret: delivery.auth.clientSecret };
    default:
      return {};
  }
}

function stripDeliverySecrets(delivery: ExportIntegrationDelivery): ExportIntegrationDelivery {
  if (delivery.type !== 'webhook') return delivery;

  const auth =
    delivery.auth.type === 'bearer'
      ? { ...delivery.auth, token: '' }
      : delivery.auth.type === 'api_key'
        ? { ...delivery.auth, value: '' }
        : delivery.auth.type === 'basic'
          ? { ...delivery.auth, password: '' }
          : delivery.auth.type === 'oauth2_cc'
            ? { ...delivery.auth, clientSecret: '' }
            : delivery.auth;

  return { ...delivery, auth };
}

function mergeDeliverySecrets(
  delivery: ExportIntegrationDelivery,
  secrets: ExportIntegrationSecrets,
): ExportIntegrationDelivery {
  if (delivery.type !== 'webhook') return delivery;

  const auth =
    delivery.auth.type === 'bearer'
      ? { ...delivery.auth, token: secrets.bearerToken ?? delivery.auth.token }
      : delivery.auth.type === 'api_key'
        ? { ...delivery.auth, value: secrets.apiKeyValue ?? delivery.auth.value }
        : delivery.auth.type === 'basic'
          ? { ...delivery.auth, password: secrets.basicPassword ?? delivery.auth.password }
          : delivery.auth.type === 'oauth2_cc'
            ? {
                ...delivery.auth,
                clientSecret: secrets.oauth2ClientSecret ?? delivery.auth.clientSecret,
              }
            : delivery.auth;

  return { ...delivery, auth };
}

function hasUrlSecretFields(delivery: ExportIntegrationDelivery): boolean {
  if (delivery.type !== 'webhook') return false;
  switch (delivery.auth.type) {
    case 'bearer':
      return !!delivery.auth.token.trim();
    case 'api_key':
      return !!delivery.auth.value.trim();
    case 'basic':
      return !!delivery.auth.password.trim();
    case 'oauth2_cc':
      return !!delivery.auth.clientSecret.trim();
    default:
      return false;
  }
}

function getSampleXml(documentType: ExportIntegrationDocumentType): string {
  if (documentType === 'invoice') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="${INVOICE_XML_NAMESPACE}">
  <Id>test-invoice</Id>
  <Number>2026-001</Number>
  <ClientId>client-1</ClientId>
  <IssueDate>2026-03-22</IssueDate>
  <Currency>EUR</Currency>
  <Seller>
    <Name>Faktoro s.r.o.</Name>
  </Seller>
  <Buyer>
    <Name>Example Client</Name>
  </Buyer>
  <Summary>
    <Subtotal>100.00</Subtotal>
    <Total>121.00</Total>
  </Summary>
  <Items>
    <Item>
      <Id>item-1</Id>
      <Description>Consulting</Description>
      <Quantity>1.0000</Quantity>
      <UnitPrice>100.00</UnitPrice>
      <TotalPrice>100.00</TotalPrice>
    </Item>
  </Items>
</Invoice>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Timesheet xmlns="${TIMESHEET_XML_NAMESPACE}">
  <Id>test-timesheet</Id>
  <Number>TS-2026-001</Number>
  <Client>
    <Id>client-1</Id>
    <Name>Example Client</Name>
  </Client>
  <Period>
    <Type>custom</Type>
    <From>2026-03-01</From>
    <To>2026-03-22</To>
  </Period>
  <Summary>
    <TotalEntries>1</TotalEntries>
    <TotalDurationSeconds>3600</TotalDurationSeconds>
    <TotalDurationHours>1.0000</TotalDurationHours>
  </Summary>
  <Entries>
    <Entry>
      <Id>entry-1</Id>
      <Description>Consulting</Description>
      <DurationSeconds>3600</DurationSeconds>
      <DurationHours>1.0000</DurationHours>
    </Entry>
  </Entries>
</Timesheet>`;
}

function hasXsltRoot(xsltStr: string): boolean {
  return /<\s*xsl:(stylesheet|transform)\b/i.test(xsltStr);
}

function generateId(): string {
  return `ei_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_DELIVERY: ExportIntegrationDelivery = { type: 'share' };

function getXmlParser(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DOMParser } = require('@xmldom/xmldom');
  return DOMParser;
}

function parseXmlDocument(xmlStr: string, context: string): any {
  const DOMParser = getXmlParser();
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => {
        throw new Error(`${context}: ${message}`);
      },
      fatalError: (message: string) => {
        throw new Error(`${context}: ${message}`);
      },
    },
  });

  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors?.length) {
    throw new Error(`${context}: parser error`);
  }
  if (!doc?.documentElement) {
    throw new Error(`${context}: missing document root`);
  }
  return doc;
}

function getXsltOutputOptions(xsltStr: string): {
  method: string;
  omitXmlDeclaration: boolean;
  encoding: string;
} {
  const doc = parseXmlDocument(xsltStr, 'XSLT stylesheet');
  const outputElement =
    doc.getElementsByTagNameNS?.(XSLT_NAMESPACE, 'output')?.[0] ??
    doc.getElementsByTagName?.('xsl:output')?.[0] ??
    null;

  const method = outputElement?.getAttribute?.('method')?.trim()?.toLowerCase() || 'xml';
  const omitXmlDeclaration =
    outputElement?.getAttribute?.('omit-xml-declaration')?.trim()?.toLowerCase() === 'yes';
  const encoding = outputElement?.getAttribute?.('encoding')?.trim() || 'UTF-8';

  return { method, omitXmlDeclaration, encoding };
}

function ensureXmlDeclaration(result: string, xsltStr: string): string {
  if (/^\s*<\?xml\b/i.test(result)) {
    return result;
  }

  const { method, omitXmlDeclaration, encoding } = getXsltOutputOptions(xsltStr);
  if (method !== 'xml' || omitXmlDeclaration) {
    return result;
  }

  const body = result.trimStart();
  return `<?xml version="1.0" encoding="${encoding}"?>\n${body}`;
}

function findDirectChild(element: any, localName: string): any | null {
  const childNodes = Array.from(element?.childNodes ?? []);
  return (
    childNodes.find(
      (node: any) =>
        node?.nodeType === 1 && (node.localName === localName || node.nodeName === localName),
    ) ?? null
  );
}

function assertRequiredChildren(element: any, localNames: string[], context: string): void {
  for (const localName of localNames) {
    if (!findDirectChild(element, localName)) {
      throw new Error(`${context}: missing <${localName}>`);
    }
  }
}

export function validateBaseExportXml(
  documentType: ExportIntegrationDocumentType,
  xmlStr: string,
): void {
  const doc = parseXmlDocument(xmlStr, 'Generated XML');
  const root = doc.documentElement;

  if (documentType === 'invoice') {
    if (root.localName !== 'Invoice' || root.namespaceURI !== INVOICE_XML_NAMESPACE) {
      throw new Error('Generated XML: invalid Faktoro invoice root element');
    }
    assertRequiredChildren(
      root,
      ['Id', 'Number', 'ClientId', 'IssueDate', 'Currency', 'Seller', 'Buyer', 'Summary', 'Items'],
      'Generated XML',
    );
    assertRequiredChildren(
      findDirectChild(root, 'Summary'),
      ['Subtotal', 'Total'],
      'Generated XML',
    );
    return;
  }

  if (root.localName !== 'Timesheet' || root.namespaceURI !== TIMESHEET_XML_NAMESPACE) {
    throw new Error('Generated XML: invalid Faktoro timesheet root element');
  }
  assertRequiredChildren(root, ['Id', 'Client', 'Period', 'Summary', 'Entries'], 'Generated XML');
  assertRequiredChildren(findDirectChild(root, 'Period'), ['Type', 'From', 'To'], 'Generated XML');
  assertRequiredChildren(
    findDirectChild(root, 'Summary'),
    ['TotalEntries', 'TotalDurationSeconds', 'TotalDurationHours'],
    'Generated XML',
  );
}

function validateProducedXml(xmlStr: string): void {
  parseXmlDocument(xmlStr, 'Exported XML');
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
  const suffix = body ? ` — ${body.slice(0, 180)}` : '';
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
  options: { timeoutMs: number; context: string },
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
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
        if (attempt < MAX_HTTP_ATTEMPTS && isRetryableStatus(response.status)) {
          lastError = httpError;
          continue;
        }
        throw httpError;
      }
      return response;
    } catch (error) {
      if (attempt < MAX_HTTP_ATTEMPTS && isRetryableNetworkError(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.context} failed.`);
}

function parseEndpointUrl(value: string, context: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${context}: invalid URL`);
  }

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
    throw new Error(`${context}: HTTPS is required`);
  }

  return parsed;
}

async function loadCachedToken(integrationId: string): Promise<CachedToken | null> {
  const storageKey = getTokenCacheStorageKey(integrationId);
  let raw = await getSecureValue(storageKey);
  if (!raw) {
    const legacyRaw = await getConfigValue(`${LEGACY_TOKEN_CACHE_PREFIX}${integrationId}`);
    if (legacyRaw) {
      raw = legacyRaw;
      await setSecureValue(storageKey, legacyRaw);
      await setConfigValue(`${LEGACY_TOKEN_CACHE_PREFIX}${integrationId}`, null);
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedToken;
  } catch {
    return null;
  }
}

async function saveCachedToken(integrationId: string, token: CachedToken): Promise<void> {
  await setSecureValue(getTokenCacheStorageKey(integrationId), JSON.stringify(token));
}

async function clearCachedToken(integrationId: string): Promise<void> {
  await setSecureValue(getTokenCacheStorageKey(integrationId), null);
}

async function getOAuth2CCToken(
  integrationId: string,
  auth: Extract<WebhookAuth, { type: 'oauth2_cc' }>,
): Promise<string> {
  const cached = await loadCachedToken(integrationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  parseEndpointUrl(auth.tokenUrl, 'OAuth2 token URL');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    ...(auth.scope ? { scope: auth.scope } : {}),
  });

  const resp = await executeHttpRequest(
    auth.tokenUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    {
      timeoutMs: TOKEN_REQUEST_TIMEOUT_MS,
      context: 'OAuth2 token request',
    },
  );

  const json = (await resp.json()) as { access_token: string; expires_in?: number };
  const accessToken = json.access_token;
  const expiresIn = json.expires_in ?? 3600;

  await saveCachedToken(integrationId, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

async function resolveAuthHeaders(
  integrationId: string,
  auth: WebhookAuth,
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
      const token = await getOAuth2CCToken(integrationId, auth);
      return { Authorization: `Bearer ${token}` };
    }
    default:
      return {};
  }
}

// --- CRUD ---

async function loadAll(): Promise<ExportIntegration[]> {
  const raw = await getConfigValue(CONFIG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let needsResave = false;
    const integrations = await Promise.all(
      parsed.map(async (item) => {
        const normalized: ExportIntegration = {
          ...item,
          description: item.description ?? '',
          delivery: item.delivery ?? DEFAULT_DELIVERY,
        };

        if (hasUrlSecretFields(normalized.delivery)) {
          needsResave = true;
          await saveIntegrationSecrets(normalized.id, extractDeliverySecrets(normalized.delivery));
        }

        const secrets = await loadIntegrationSecrets(normalized.id);
        return {
          ...normalized,
          delivery: mergeDeliverySecrets(stripDeliverySecrets(normalized.delivery), secrets),
        };
      }),
    );

    if (needsResave) {
      await saveAll(integrations);
    }

    return integrations;
  } catch {
    return [];
  }
}

async function saveAll(integrations: ExportIntegration[]): Promise<void> {
  await Promise.all(
    integrations.map(async (integration) => {
      await saveIntegrationSecrets(integration.id, extractDeliverySecrets(integration.delivery));
    }),
  );

  const sanitized = integrations.map((integration) => ({
    ...integration,
    delivery: stripDeliverySecrets(integration.delivery),
  }));

  await setConfigValue(CONFIG_KEY, JSON.stringify(sanitized));
}

export async function getExportIntegrations(
  documentType?: ExportIntegrationDocumentType,
): Promise<ExportIntegration[]> {
  const all = await loadAll();
  if (documentType) return all.filter((i) => i.documentType === documentType);
  return all;
}

export async function createExportIntegration(input: {
  name: string;
  description?: string;
  documentType: ExportIntegrationDocumentType;
  delivery: ExportIntegrationDelivery;
  xslt: string;
}): Promise<ExportIntegration> {
  const all = await loadAll();
  const integration: ExportIntegration = {
    id: generateId(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    documentType: input.documentType,
    delivery: input.delivery,
    xslt: input.xslt.trim(),
    createdAt: Date.now(),
  };
  await saveAll([...all, integration]);
  return integration;
}

export async function updateExportIntegration(
  id: string,
  input: {
    name?: string;
    description?: string;
    documentType?: ExportIntegrationDocumentType;
    delivery?: ExportIntegrationDelivery;
    xslt?: string;
  },
): Promise<ExportIntegration | null> {
  const all = await loadAll();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated: ExportIntegration = {
    ...all[idx],
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
    ...(input.delivery !== undefined ? { delivery: input.delivery } : {}),
    ...(input.xslt !== undefined ? { xslt: input.xslt.trim() } : {}),
  };
  const next = [...all];
  next[idx] = updated;
  await saveAll(next);
  // If delivery auth changed, clear cached token so it's re-fetched
  await clearCachedToken(id);
  return updated;
}

export async function deleteExportIntegration(id: string): Promise<void> {
  const all = await loadAll();
  await saveAll(all.filter((i) => i.id !== id));
  await clearIntegrationSecrets(id);
  await clearCachedToken(id);
}

export async function validateExportIntegrationXslt(
  documentType: ExportIntegrationDocumentType,
  xsltStr: string,
): Promise<void> {
  await transformExportXml(documentType, getSampleXml(documentType), xsltStr);
}

export async function applyXsltToXml(xmlStr: string, xsltStr: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Xslt, XmlParser } = require('xslt-processor');
  const xsltClass = new Xslt();
  const xmlParser = new XmlParser();
  const xmlDoc = xmlParser.xmlParse(xmlStr);
  const xsltDoc = xmlParser.xmlParse(xsltStr);
  return await xsltClass.xsltProcess(xmlDoc, xsltDoc);
}

export async function transformExportXml(
  documentType: ExportIntegrationDocumentType,
  sourceXml: string,
  xsltStr: string,
): Promise<string> {
  const trimmed = xsltStr.trim();
  if (!trimmed) throw new Error('XSLT stylesheet is empty.');
  if (!hasXsltRoot(trimmed)) {
    throw new Error('XSLT stylesheet must use xsl:stylesheet or xsl:transform as the root.');
  }
  validateBaseExportXml(documentType, sourceXml);
  const result = ensureXmlDeclaration(await applyXsltToXml(sourceXml, trimmed), trimmed);
  if (!result || !result.trim()) {
    throw new Error('XSLT transformation returned an empty result.');
  }
  validateProducedXml(result);
  return result;
}

export async function testExportIntegrationTransform(
  documentType: ExportIntegrationDocumentType,
  xsltStr: string,
): Promise<string> {
  return transformExportXml(documentType, getSampleXml(documentType), xsltStr);
}

export async function testExportIntegrationDelivery(
  integration: ExportIntegration,
): Promise<DeliverResult> {
  const transformed = await transformExportXml(
    integration.documentType,
    getSampleXml(integration.documentType),
    integration.xslt,
  );
  return deliverIntegrationResult(
    integration,
    transformed,
    `faktoro-${integration.documentType}-sample.xml`,
  );
}

export type DeliverResult =
  | { outcome: 'shared' }
  | { outcome: 'copied' }
  | { outcome: 'sent'; status: number };

export async function deliverIntegrationResult(
  integration: ExportIntegration,
  content: string,
  filename: string,
): Promise<DeliverResult> {
  const { delivery } = integration;

  if (delivery.type === 'clipboard') {
    const Clipboard = getClipboardModule();
    await Clipboard.setStringAsync(content);
    return { outcome: 'copied' };
  }

  if (delivery.type === 'webhook') {
    parseEndpointUrl(delivery.url, 'Webhook URL');
    const authHeaders = await resolveAuthHeaders(integration.id, delivery.auth);
    const extraHeaders = Object.fromEntries(
      delivery.headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
    );

    const resp = await executeHttpRequest(
      delivery.url,
      {
        method: delivery.method,
        headers: {
          'Content-Type': delivery.contentType || 'application/xml',
          ...authHeaders,
          ...extraHeaders,
        },
        body: content,
      },
      {
        timeoutMs: WEBHOOK_REQUEST_TIMEOUT_MS,
        context: 'Webhook request',
      },
    );

    return { outcome: 'sent', status: resp.status };
  }

  // Default: share
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystemLegacy = require('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing');

  const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
  if (!cacheDirectory) throw new Error('Missing cache directory');

  const targetUri = `${cacheDirectory}${filename}`;
  await FileSystemLegacy.writeAsStringAsync(targetUri, content, {
    encoding: FileSystemLegacy.EncodingType?.UTF8 ?? 'utf8',
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing unavailable');

  await Sharing.shareAsync(targetUri, { mimeType: 'application/xml' });
  return { outcome: 'shared' };
}
