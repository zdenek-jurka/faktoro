export const DEFAULT_CURRENCY_CODE = 'CZK';

export type CurrencyFormatDefinition = {
  code: string;
  prefix: string;
  suffix: string;
  sortOrder: number;
  isActive: boolean;
};

const FALLBACK_CURRENCY_DEFINITIONS: CurrencyFormatDefinition[] = [
  { code: 'EUR', prefix: '€', suffix: '', sortOrder: 10, isActive: true },
  { code: 'CZK', prefix: '', suffix: ' Kč', sortOrder: 20, isActive: true },
  { code: 'USD', prefix: '$', suffix: '', sortOrder: 30, isActive: true },
  { code: 'CHF', prefix: '', suffix: ' CHF', sortOrder: 40, isActive: true },
];

let currencyFormatDefinitions = new Map<string, CurrencyFormatDefinition>(
  FALLBACK_CURRENCY_DEFINITIONS.map((definition) => [definition.code, definition]),
);

export function setCurrencyFormatDefinitions(definitions: CurrencyFormatDefinition[]): void {
  const nextDefinitions = definitions.length > 0 ? definitions : FALLBACK_CURRENCY_DEFINITIONS;
  currencyFormatDefinitions = new Map(
    nextDefinitions.map((definition) => [
      normalizeCurrencyCode(definition.code, DEFAULT_CURRENCY_CODE),
      {
        ...definition,
        code: normalizeCurrencyCode(definition.code, DEFAULT_CURRENCY_CODE),
        prefix: definition.prefix || '',
        suffix: definition.suffix || '',
      },
    ]),
  );
}

export function getCurrencyFormatDefinition(code?: string | null): CurrencyFormatDefinition {
  const normalizedCode = normalizeCurrencyCode(code, DEFAULT_CURRENCY_CODE);
  return (
    currencyFormatDefinitions.get(normalizedCode) || {
      code: normalizedCode,
      prefix: '',
      suffix: ` ${normalizedCode}`,
      sortOrder: Number.MAX_SAFE_INTEGER,
      isActive: true,
    }
  );
}

export function normalizeCurrencyCode(
  value?: string | null,
  fallback: string = DEFAULT_CURRENCY_CODE,
): string {
  const normalized = (value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

export function hasMatchingCurrency(
  left?: string | null,
  right?: string | null,
  fallback: string = DEFAULT_CURRENCY_CODE,
): boolean {
  return normalizeCurrencyCode(left, fallback) === normalizeCurrencyCode(right, fallback);
}
