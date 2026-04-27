import {
  getRegistrySettings,
  upsertRegistrySetting,
} from '@/repositories/registry-settings-repository';
import {
  clearHttpAuthCachedToken,
  extractHttpAuthSecrets,
  HTTP_AUTH_TYPES,
  type HttpAuth,
  type HttpAuthType,
  loadHttpAuthSecrets,
  mergeHttpAuthSecrets,
  saveHttpAuthSecrets,
  stripHttpAuthSecrets,
} from '@/utils/http-auth';

const REGISTRY_KEY = 'custom_connector';
const SECRET_STORE_KEY = 'company_registry_secret.custom_connector';
const TOKEN_CACHE_KEY = 'company_registry_oauth2_token.custom_connector';

const AUTH_SETTING_KEYS = [
  'auth_type',
  'bearer_token',
  'api_key_header',
  'api_key_value',
  'basic_username',
  'basic_password',
  'oauth2_token_url',
  'oauth2_client_id',
  'oauth2_client_secret',
  'oauth2_scope',
  'header_key',
  'header_value',
] as const;

export type CustomConnectorSettings = {
  url: string;
  auth: HttpAuth;
};

function normalizeAuthType(value?: string | null): HttpAuthType | null {
  if (!value) return null;
  const normalized = value.trim() as HttpAuthType;
  return HTTP_AUTH_TYPES.includes(normalized) ? normalized : null;
}

export function getCustomConnectorTokenCacheStorageKey(): string {
  return TOKEN_CACHE_KEY;
}

export function buildCustomConnectorAuthFromSettings(
  settings: Partial<Record<string, string>>,
): HttpAuth {
  const authType = normalizeAuthType(settings.auth_type);

  if (!authType) {
    const legacyHeaderName = settings.header_key?.trim() ?? '';
    const legacyHeaderValue = settings.header_value?.trim() ?? '';
    if (legacyHeaderName || legacyHeaderValue) {
      return {
        type: 'api_key',
        headerName: legacyHeaderName,
        value: legacyHeaderValue,
      };
    }
    return { type: 'none' };
  }

  if (authType === 'bearer') {
    return { type: 'bearer', token: settings.bearer_token?.trim() ?? '' };
  }
  if (authType === 'api_key') {
    return {
      type: 'api_key',
      headerName: settings.api_key_header?.trim() || settings.header_key?.trim() || '',
      value: settings.api_key_value?.trim() || settings.header_value?.trim() || '',
    };
  }
  if (authType === 'basic') {
    return {
      type: 'basic',
      username: settings.basic_username?.trim() ?? '',
      password: settings.basic_password?.trim() ?? '',
    };
  }
  if (authType === 'oauth2_cc') {
    return {
      type: 'oauth2_cc',
      tokenUrl: settings.oauth2_token_url?.trim() ?? '',
      clientId: settings.oauth2_client_id?.trim() ?? '',
      clientSecret: settings.oauth2_client_secret?.trim() ?? '',
      scope: settings.oauth2_scope?.trim() ?? '',
    };
  }
  return { type: 'none' };
}

function authToSettings(
  auth: HttpAuth,
): Partial<Record<(typeof AUTH_SETTING_KEYS)[number], string>> {
  const stripped = stripHttpAuthSecrets(auth);

  if (stripped.type === 'bearer') {
    return { auth_type: 'bearer', bearer_token: stripped.token };
  }
  if (stripped.type === 'api_key') {
    return {
      auth_type: 'api_key',
      api_key_header: stripped.headerName,
      api_key_value: stripped.value,
    };
  }
  if (stripped.type === 'basic') {
    return {
      auth_type: 'basic',
      basic_username: stripped.username,
      basic_password: stripped.password,
    };
  }
  if (stripped.type === 'oauth2_cc') {
    return {
      auth_type: 'oauth2_cc',
      oauth2_token_url: stripped.tokenUrl,
      oauth2_client_id: stripped.clientId,
      oauth2_client_secret: stripped.clientSecret,
      oauth2_scope: stripped.scope,
    };
  }
  return { auth_type: 'none' };
}

function authToRuntimeSettings(auth: HttpAuth): Record<string, string> {
  if (auth.type === 'bearer') {
    return { auth_type: 'bearer', bearer_token: auth.token };
  }
  if (auth.type === 'api_key') {
    return {
      auth_type: 'api_key',
      api_key_header: auth.headerName,
      api_key_value: auth.value,
    };
  }
  if (auth.type === 'basic') {
    return {
      auth_type: 'basic',
      basic_username: auth.username,
      basic_password: auth.password,
    };
  }
  if (auth.type === 'oauth2_cc') {
    return {
      auth_type: 'oauth2_cc',
      oauth2_token_url: auth.tokenUrl,
      oauth2_client_id: auth.clientId,
      oauth2_client_secret: auth.clientSecret,
      oauth2_scope: auth.scope,
    };
  }
  return { auth_type: 'none' };
}

export async function loadCustomConnectorSettings(): Promise<CustomConnectorSettings> {
  const settings = await getRegistrySettings(REGISTRY_KEY);
  const auth = mergeHttpAuthSecrets(
    buildCustomConnectorAuthFromSettings(settings),
    await loadHttpAuthSecrets(SECRET_STORE_KEY),
  );
  return {
    url: settings.url ?? '',
    auth,
  };
}

export async function loadCustomConnectorRuntimeSettings(): Promise<Record<string, string>> {
  const settings = await loadCustomConnectorSettings();
  return {
    url: settings.url,
    ...authToRuntimeSettings(settings.auth),
  };
}

export async function saveCustomConnectorSettings(input: CustomConnectorSettings): Promise<void> {
  await saveHttpAuthSecrets(SECRET_STORE_KEY, extractHttpAuthSecrets(input.auth));
  const authSettings = authToSettings(input.auth);

  await Promise.all([
    upsertRegistrySetting(REGISTRY_KEY, 'url', input.url),
    ...AUTH_SETTING_KEYS.map((key) =>
      upsertRegistrySetting(REGISTRY_KEY, key, authSettings[key] ?? null),
    ),
  ]);

  await clearHttpAuthCachedToken(TOKEN_CACHE_KEY);
}
