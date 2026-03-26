import {
  CompanyRegistryCompany,
  CompanyRegistryLookupError,
  CompanyRegistryService,
} from './types';

const INSEE_NEW_BASE_URL = 'https://api.insee.fr/api-sirene/3.11';
const INSEE_DEBUG_PREFIX = '[INSEE]';

type InseeResponse = {
  etablissementSiege?: {
    adresseEtablissement?: {
      numeroVoieEtablissement?: string;
      typeVoieEtablissement?: string;
      libelleVoieEtablissement?: string;
      codePostalEtablissement?: string;
      libelleCommuneEtablissement?: string;
    };
  };
  uniteLegale?: {
    siren?: string;
    denominationUniteLegale?: string;
    adresseSiegeUniteLegale?: {
      numeroVoieEtablissement?: string;
      typeVoieEtablissement?: string;
      libelleVoieEtablissement?: string;
      codePostalEtablissement?: string;
      libelleCommuneEtablissement?: string;
      codePostal?: string;
      libelleCommune?: string;
    };
    periodesUniteLegale?: Array<{
      denominationUniteLegale?: string;
      nicSiegeUniteLegale?: string;
      adresseEtablissement?: {
        numeroVoieEtablissement?: string;
        typeVoieEtablissement?: string;
        libelleVoieEtablissement?: string;
        codePostalEtablissement?: string;
        libelleCommuneEtablissement?: string;
      };
    }>;
    periodesEtablissement?: Array<{
      adresseEtablissement?: {
        numeroVoieEtablissement?: string;
        typeVoieEtablissement?: string;
        libelleVoieEtablissement?: string;
        codePostalEtablissement?: string;
        libelleCommuneEtablissement?: string;
        codePostal?: string;
        libelleCommune?: string;
      };
    }>;
  };
};

type InseeAddressLike = {
  numeroVoieEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
  codePostal?: string;
  libelleCommune?: string;
};

function pickInseeAddress(
  data: InseeResponse,
): { source: string; address: InseeAddressLike } | undefined {
  const legalUnit = data.uniteLegale;
  const candidates: Array<{ source: string; address: InseeAddressLike | undefined }> = [
    {
      source: 'etablissementSiege.adresseEtablissement',
      address: data.etablissementSiege?.adresseEtablissement,
    },
    { source: 'uniteLegale.adresseSiegeUniteLegale', address: legalUnit?.adresseSiegeUniteLegale },
    {
      source: 'uniteLegale.periodesEtablissement[0].adresseEtablissement',
      address: legalUnit?.periodesEtablissement?.[0]?.adresseEtablissement,
    },
    {
      source: 'uniteLegale.periodesUniteLegale[0].adresseEtablissement',
      address: legalUnit?.periodesUniteLegale?.[0]?.adresseEtablissement,
    },
  ];

  const found = candidates.find(
    (candidate) =>
      !!candidate.address &&
      !!(
        candidate.address.numeroVoieEtablissement ||
        candidate.address.libelleVoieEtablissement ||
        candidate.address.codePostalEtablissement ||
        candidate.address.libelleCommuneEtablissement ||
        candidate.address.codePostal ||
        candidate.address.libelleCommune
      ),
  );
  if (!found?.address) return undefined;
  return { source: found.source, address: found.address };
}

function debugInseeLog(message: string, meta?: Record<string, unknown>) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (meta) {
    console.log(INSEE_DEBUG_PREFIX, message, meta);
    return;
  }
  console.log(INSEE_DEBUG_PREFIX, message);
}

function normalizeCompanyId(companyId: string): string {
  return companyId.replace(/\s+/g, '');
}

function mapInseeError(status: number): CompanyRegistryLookupError {
  if (status === 400) {
    return new CompanyRegistryLookupError('invalid_company_id', 'Invalid company ID');
  }
  if (status === 401 || status === 403) {
    return new CompanyRegistryLookupError(
      'configuration_required',
      'INSEE API token is missing or invalid',
    );
  }
  if (status === 404) {
    return new CompanyRegistryLookupError('company_not_found', 'Company not found');
  }
  if (status >= 500) {
    return new CompanyRegistryLookupError(
      'service_unavailable',
      'INSEE SIRENE service is currently unavailable',
    );
  }
  return new CompanyRegistryLookupError('unknown', 'Unknown INSEE SIRENE error');
}

export class InseeSireneRegistryService implements CompanyRegistryService {
  readonly countryCode = 'FR';
  readonly registryName = 'INSEE SIRENE';
  private readonly apiKey?: string;

  constructor(input?: { apiToken?: string; apiKey?: string }) {
    this.apiKey = input?.apiKey?.trim() || input?.apiToken?.trim();
  }

  async lookupCompanyById(companyId: string): Promise<CompanyRegistryCompany> {
    const normalizedCompanyId = normalizeCompanyId(companyId);
    debugInseeLog('lookup_start', { companyId, normalizedCompanyId });
    if (!/^\d{9}$/.test(normalizedCompanyId)) {
      debugInseeLog('lookup_invalid_company_id', { normalizedCompanyId });
      throw new CompanyRegistryLookupError(
        'invalid_company_id',
        'Company ID must have 9 digits for France SIREN lookup',
      );
    }

    const apiKey = this.apiKey;
    if (!apiKey?.trim()) {
      debugInseeLog('lookup_missing_token');
      throw new CompanyRegistryLookupError(
        'configuration_required',
        'Set INSEE API key in registry settings',
      );
    }
    const normalizedApiKey = apiKey.trim();
    debugInseeLog('lookup_token_loaded', {
      tokenLength: normalizedApiKey.length,
      tokenPrefix: normalizedApiKey.slice(0, 4),
    });

    const candidates = [
      {
        baseUrl: INSEE_NEW_BASE_URL,
        headerName: 'X-INSEE-Api-Key',
        authMode: 'x_insee_api_key',
      },
      {
        baseUrl: INSEE_NEW_BASE_URL,
        headerName: 'X-INSEE-Api-Key-Integration',
        authMode: 'x_insee_api_key_integration',
      },
    ];

    let response: Response | null = null;
    let lastStatus: number | null = null;

    for (const candidate of candidates) {
      const requestUrl = `${candidate.baseUrl}/siren/${normalizedCompanyId}`;
      debugInseeLog('lookup_attempt', {
        url: requestUrl,
        authMode: candidate.authMode,
      });
      try {
        const currentResponse = await fetch(requestUrl, {
          headers: {
            Accept: 'application/json',
            [candidate.headerName]: normalizedApiKey,
          },
        });
        const responseBodyPreview =
          currentResponse.status >= 400
            ? await currentResponse
                .clone()
                .text()
                .then((body) => body.slice(0, 1500))
                .catch(() => '')
            : '';

        debugInseeLog('lookup_attempt_response', {
          url: requestUrl,
          authMode: candidate.authMode,
          status: currentResponse.status,
          statusText: currentResponse.statusText,
          responseBodyPreview,
        });

        if (currentResponse.status === 401 || currentResponse.status === 403) {
          lastStatus = currentResponse.status;
          debugInseeLog('lookup_attempt_unauthorized', {
            authMode: candidate.authMode,
            status: currentResponse.status,
          });
          continue;
        }

        response = currentResponse;
        break;
      } catch {
        debugInseeLog('lookup_network_error', {
          url: requestUrl,
          authMode: candidate.authMode,
        });
        throw new CompanyRegistryLookupError(
          'service_unavailable',
          'Unable to connect to INSEE SIRENE service',
        );
      }
    }

    if (!response) {
      debugInseeLog('lookup_all_attempts_failed', { lastStatus });
      throw mapInseeError(lastStatus ?? 401);
    }

    if (!response.ok) {
      debugInseeLog('lookup_not_ok', { status: response.status });
      throw mapInseeError(response.status);
    }

    let data: InseeResponse;
    try {
      data = (await response.json()) as InseeResponse;
      debugInseeLog('lookup_response_body', { data });
    } catch {
      debugInseeLog('lookup_invalid_json');
      throw new CompanyRegistryLookupError('unknown', 'Invalid response from INSEE SIRENE service');
    }

    const legalUnit = data.uniteLegale;
    const legalName =
      legalUnit?.denominationUniteLegale ||
      legalUnit?.periodesUniteLegale?.[0]?.denominationUniteLegale ||
      undefined;
    const companyIdFromData = legalUnit?.siren;

    if (!legalName || !companyIdFromData) {
      debugInseeLog('lookup_incomplete_data', {
        hasLegalName: !!legalName,
        hasCompanyId: !!companyIdFromData,
      });
      throw new CompanyRegistryLookupError('unknown', 'Incomplete company data from INSEE SIRENE');
    }

    const selectedAddress = pickInseeAddress(data);
    const establishmentAddress = selectedAddress?.address;
    const formatted = [
      establishmentAddress?.numeroVoieEtablissement,
      establishmentAddress?.typeVoieEtablissement,
      establishmentAddress?.libelleVoieEtablissement,
    ]
      .filter(Boolean)
      .join(' ');

    const result = {
      companyId: companyIdFromData,
      legalName,
      countryCode: 'FR',
      address: {
        formatted: formatted || undefined,
        city:
          establishmentAddress?.libelleCommuneEtablissement || establishmentAddress?.libelleCommune,
        postalCode:
          establishmentAddress?.codePostalEtablissement || establishmentAddress?.codePostal,
        country: 'FR',
      },
    };
    debugInseeLog('lookup_success', {
      companyId: result.companyId,
      legalName: result.legalName,
      hasAddress: !!result.address.formatted,
      addressSource: selectedAddress?.source || 'none',
    });
    return result;
  }
}
