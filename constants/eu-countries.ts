import type { Locales } from '@/i18n/i18n-types';

export const EU_MEMBER_STATE_CODES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'EL',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

export type EuMemberStateCode = (typeof EU_MEMBER_STATE_CODES)[number];

const EXTRA_ALIASES: Partial<Record<EuMemberStateCode, string[]>> = {
  CZ: ['Czech Republic', 'Ceska republika', 'Česká republika'],
  EL: ['GR', 'Greek Republic', 'Hellenic Republic', 'Řecká republika'],
  SK: ['Slovak Republic'],
};

const FALLBACK_LABELS: Record<EuMemberStateCode, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  HR: 'Croatia',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DK: 'Denmark',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  EL: 'Greece',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
  SE: 'Sweden',
};

const LOCALIZED_LABELS: Record<Locales, Record<EuMemberStateCode, string>> = {
  en: FALLBACK_LABELS,
  cs: {
    AT: 'Rakousko',
    BE: 'Belgie',
    BG: 'Bulharsko',
    HR: 'Chorvatsko',
    CY: 'Kypr',
    CZ: 'Česko',
    DK: 'Dánsko',
    EE: 'Estonsko',
    FI: 'Finsko',
    FR: 'Francie',
    DE: 'Německo',
    EL: 'Řecko',
    HU: 'Maďarsko',
    IE: 'Irsko',
    IT: 'Itálie',
    LV: 'Lotyšsko',
    LT: 'Litva',
    LU: 'Lucembursko',
    MT: 'Malta',
    NL: 'Nizozemsko',
    PL: 'Polsko',
    PT: 'Portugalsko',
    RO: 'Rumunsko',
    SK: 'Slovensko',
    SI: 'Slovinsko',
    ES: 'Španělsko',
    SE: 'Švédsko',
  },
  de: {
    AT: 'Österreich',
    BE: 'Belgien',
    BG: 'Bulgarien',
    HR: 'Kroatien',
    CY: 'Zypern',
    CZ: 'Tschechien',
    DK: 'Dänemark',
    EE: 'Estland',
    FI: 'Finnland',
    FR: 'Frankreich',
    DE: 'Deutschland',
    EL: 'Griechenland',
    HU: 'Ungarn',
    IE: 'Irland',
    IT: 'Italien',
    LV: 'Lettland',
    LT: 'Litauen',
    LU: 'Luxemburg',
    MT: 'Malta',
    NL: 'Niederlande',
    PL: 'Polen',
    PT: 'Portugal',
    RO: 'Rumänien',
    SK: 'Slowakei',
    SI: 'Slowenien',
    ES: 'Spanien',
    SE: 'Schweden',
  },
  es: {
    AT: 'Austria',
    BE: 'Bélgica',
    BG: 'Bulgaria',
    HR: 'Croacia',
    CY: 'Chipre',
    CZ: 'Chequia',
    DK: 'Dinamarca',
    EE: 'Estonia',
    FI: 'Finlandia',
    FR: 'Francia',
    DE: 'Alemania',
    EL: 'Grecia',
    HU: 'Hungría',
    IE: 'Irlanda',
    IT: 'Italia',
    LV: 'Letonia',
    LT: 'Lituania',
    LU: 'Luxemburgo',
    MT: 'Malta',
    NL: 'Países Bajos',
    PL: 'Polonia',
    PT: 'Portugal',
    RO: 'Rumanía',
    SK: 'Eslovaquia',
    SI: 'Eslovenia',
    ES: 'España',
    SE: 'Suecia',
  },
  fr: {
    AT: 'Autriche',
    BE: 'Belgique',
    BG: 'Bulgarie',
    HR: 'Croatie',
    CY: 'Chypre',
    CZ: 'Tchéquie',
    DK: 'Danemark',
    EE: 'Estonie',
    FI: 'Finlande',
    FR: 'France',
    DE: 'Allemagne',
    EL: 'Grèce',
    HU: 'Hongrie',
    IE: 'Irlande',
    IT: 'Italie',
    LV: 'Lettonie',
    LT: 'Lituanie',
    LU: 'Luxembourg',
    MT: 'Malte',
    NL: 'Pays-Bas',
    PL: 'Pologne',
    PT: 'Portugal',
    RO: 'Roumanie',
    SK: 'Slovaquie',
    SI: 'Slovénie',
    ES: 'Espagne',
    SE: 'Suède',
  },
  pl: {
    AT: 'Austria',
    BE: 'Belgia',
    BG: 'Bułgaria',
    HR: 'Chorwacja',
    CY: 'Cypr',
    CZ: 'Czechy',
    DK: 'Dania',
    EE: 'Estonia',
    FI: 'Finlandia',
    FR: 'Francja',
    DE: 'Niemcy',
    EL: 'Grecja',
    HU: 'Węgry',
    IE: 'Irlandia',
    IT: 'Włochy',
    LV: 'Łotwa',
    LT: 'Litwa',
    LU: 'Luksemburg',
    MT: 'Malta',
    NL: 'Niderlandy',
    PL: 'Polska',
    PT: 'Portugalia',
    RO: 'Rumunia',
    SK: 'Słowacja',
    SI: 'Słowenia',
    ES: 'Hiszpania',
    SE: 'Szwecja',
  },
  pt: {
    AT: 'Áustria',
    BE: 'Bélgica',
    BG: 'Bulgária',
    HR: 'Croácia',
    CY: 'Chipre',
    CZ: 'Chéquia',
    DK: 'Dinamarca',
    EE: 'Estónia',
    FI: 'Finlândia',
    FR: 'França',
    DE: 'Alemanha',
    EL: 'Grécia',
    HU: 'Hungria',
    IE: 'Irlanda',
    IT: 'Itália',
    LV: 'Letónia',
    LT: 'Lituânia',
    LU: 'Luxemburgo',
    MT: 'Malta',
    NL: 'Países Baixos',
    PL: 'Polónia',
    PT: 'Portugal',
    RO: 'Roménia',
    SK: 'Eslováquia',
    SI: 'Eslovénia',
    ES: 'Espanha',
    SE: 'Suécia',
  },
};

export function isEuMemberStateCode(value: unknown): value is EuMemberStateCode {
  return typeof value === 'string' && EU_MEMBER_STATE_CODES.includes(value as EuMemberStateCode);
}

function normalizeCountryLookupValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()'".,/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getEuMemberStateAliases(code: EuMemberStateCode): string[] {
  return [
    code,
    ...(code === 'EL' ? ['GR'] : []),
    FALLBACK_LABELS[code],
    ...Object.values(LOCALIZED_LABELS).map((labels) => labels[code]),
    ...(EXTRA_ALIASES[code] ?? []),
  ];
}

const EU_MEMBER_STATE_LOOKUP = (() => {
  const lookup = new Map<string, EuMemberStateCode>();

  for (const code of EU_MEMBER_STATE_CODES) {
    for (const alias of getEuMemberStateAliases(code)) {
      const normalized = normalizeCountryLookupValue(alias);
      if (!normalized) continue;
      lookup.set(normalized, code);
    }
  }

  return lookup;
})();

export function normalizeEuMemberStateCode(value: unknown): EuMemberStateCode | null {
  if (typeof value !== 'string') return null;

  const normalized = normalizeCountryLookupValue(value);
  if (!normalized) return null;

  return EU_MEMBER_STATE_LOOKUP.get(normalized) ?? null;
}

export function getEuMemberStateLabel(code: EuMemberStateCode, locale: Locales): string {
  return LOCALIZED_LABELS[locale]?.[code] ?? FALLBACK_LABELS[code];
}

export function getEuMemberStateOptions(locale: Locales) {
  return [...EU_MEMBER_STATE_CODES]
    .map((code) => ({
      value: code,
      label: getEuMemberStateLabel(code, locale),
      searchText: getEuMemberStateAliases(code).join(' '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
