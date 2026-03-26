import type { EuVatBootstrapRateKind } from '@/repositories/eu-vat-bootstrap-repository';

const BOOTSTRAP_TOKEN_PREFIX = '__FAKTORO_VAT__';

type VatCodeTranslationContext = {
  settings: {
    vatBootstrapRateStandard: () => string;
    vatBootstrapRateReduced: () => string;
    vatBootstrapRateSuperReduced: () => string;
    vatBootstrapRateParking: () => string;
    vatBootstrapRateExempt: () => string;
  };
};

type ParsedBootstrapVatCodeToken = {
  kind: EuVatBootstrapRateKind;
  index: number;
  total: number;
  countryCode?: string;
};

const KIND_SEGMENTS: Record<EuVatBootstrapRateKind, string> = {
  standard: 'STANDARD',
  reduced: 'REDUCED',
  superReduced: 'SUPER_REDUCED',
  parking: 'PARKING',
  exempt: 'EXEMPT',
};

const SEGMENT_TO_KIND = Object.entries(KIND_SEGMENTS).reduce<
  Record<string, EuVatBootstrapRateKind>
>((acc, [kind, segment]) => {
  acc[segment] = kind as EuVatBootstrapRateKind;
  return acc;
}, {});

export function createBootstrapVatCodeToken(
  kind: EuVatBootstrapRateKind,
  index: number,
  total: number,
  countryCode?: string,
): string {
  const safeIndex = Math.max(1, index);
  const safeTotal = Math.max(safeIndex, total);
  const countrySegment = countryCode
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  const prefix = countrySegment ? `${countrySegment}__` : '';
  return `${BOOTSTRAP_TOKEN_PREFIX}${prefix}${KIND_SEGMENTS[kind]}__${safeIndex}__${safeTotal}`;
}

export function parseBootstrapVatCodeToken(
  value: string | null | undefined,
): ParsedBootstrapVatCodeToken | null {
  if (!value) return null;

  // New format: __FAKTORO_VAT__CZ__STANDARD__1__1
  const withCountry = value.match(/^__FAKTORO_VAT__([A-Z]{2})__([A-Z_]+)__(\d+)__(\d+)$/);
  if (withCountry) {
    const kind = SEGMENT_TO_KIND[withCountry[2]];
    if (!kind) return null;
    const index = Number.parseInt(withCountry[3], 10);
    const total = Number.parseInt(withCountry[4], 10);
    if (!Number.isFinite(index) || !Number.isFinite(total) || index < 1 || total < index) {
      return null;
    }
    return { kind, index, total, countryCode: withCountry[1] };
  }

  // Legacy format: __FAKTORO_VAT__STANDARD__1__1
  const legacy = value.match(/^__FAKTORO_VAT__([A-Z_]+)__(\d+)__(\d+)$/);
  if (!legacy) return null;
  const kind = SEGMENT_TO_KIND[legacy[1]];
  if (!kind) return null;
  const index = Number.parseInt(legacy[2], 10);
  const total = Number.parseInt(legacy[3], 10);
  if (!Number.isFinite(index) || !Number.isFinite(total) || index < 1 || total < index) {
    return null;
  }
  return { kind, index, total };
}

export function isBootstrapVatCodeToken(value: string | null | undefined): boolean {
  return parseBootstrapVatCodeToken(value) != null;
}

function getBaseLabel(kind: EuVatBootstrapRateKind, LL: VatCodeTranslationContext): string {
  switch (kind) {
    case 'standard':
      return LL.settings.vatBootstrapRateStandard();
    case 'reduced':
      return LL.settings.vatBootstrapRateReduced();
    case 'superReduced':
      return LL.settings.vatBootstrapRateSuperReduced();
    case 'parking':
      return LL.settings.vatBootstrapRateParking();
    case 'exempt':
      return LL.settings.vatBootstrapRateExempt();
  }
}

export function getLocalizedVatCodeName(
  rawName: string | null | undefined,
  LL: VatCodeTranslationContext,
): string {
  if (!rawName) {
    return '';
  }

  const parsed = parseBootstrapVatCodeToken(rawName);
  if (!parsed) {
    return rawName;
  }

  const baseLabel = getBaseLabel(parsed.kind, LL);
  const kindLabel = parsed.total <= 1 ? baseLabel : `${baseLabel} ${parsed.index}`;
  return parsed.countryCode ? `${parsed.countryCode} – ${kindLabel}` : kindLabel;
}
