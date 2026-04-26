type DecimalInputRangeOptions = {
  min?: number;
  max?: number;
  maxExclusive?: number;
};

const DECIMAL_INPUT_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const POSITIVE_INTEGER_INPUT_PATTERN = /^\+?\d+$/;

export function normalizeDecimalInput(input: string): string {
  return input.trim().replace(/\s/g, '').replace(',', '.');
}

export function parseDecimalInput(input: string): number {
  const normalized = normalizeDecimalInput(input);
  if (!DECIMAL_INPUT_PATTERN.test(normalized)) return Number.NaN;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function parseDecimalInputInRange(
  input: string,
  { min, max, maxExclusive }: DecimalInputRangeOptions,
): number {
  const value = parseDecimalInput(input);
  if (!Number.isFinite(value)) return Number.NaN;
  if (min != null && value < min) return Number.NaN;
  if (max != null && value > max) return Number.NaN;
  if (maxExclusive != null && value >= maxExclusive) return Number.NaN;

  return value;
}

export function parsePositiveDecimalInput(input: string): number {
  const value = parseDecimalInput(input);
  return Number.isFinite(value) && value > 0 ? value : Number.NaN;
}

export function parsePositiveIntegerInput(input: string): number {
  const normalized = input.trim().replace(/\s/g, '');
  if (!POSITIVE_INTEGER_INPUT_PATTERN.test(normalized)) return Number.NaN;

  const value = Number(normalized);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.NaN;
}
