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
): string {
  const safeIndex = Math.max(1, index);
  const safeTotal = Math.max(safeIndex, total);
  return `${BOOTSTRAP_TOKEN_PREFIX}${KIND_SEGMENTS[kind]}__${safeIndex}__${safeTotal}`;
}

export function parseBootstrapVatCodeToken(
  value: string | null | undefined,
): ParsedBootstrapVatCodeToken | null {
  if (!value) return null;

  const match = value.match(/^__FAKTORO_VAT__([A-Z_]+)__(\d+)__(\d+)$/);
  if (!match) return null;

  const kind = SEGMENT_TO_KIND[match[1]];
  if (!kind) return null;

  const index = Number.parseInt(match[2], 10);
  const total = Number.parseInt(match[3], 10);

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
  if (parsed.total <= 1) {
    return baseLabel;
  }

  return `${baseLabel} ${parsed.index}`;
}
