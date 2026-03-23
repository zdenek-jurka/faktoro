import {
  DEFAULT_CURRENCY_CODE,
  getCurrencyFormatDefinition,
  normalizeCurrencyCode,
} from '@/utils/currency-utils';

/**
 * Format a price value for display
 * @param price The price to format
 * @param currency The currency code (default: DEFAULT_CURRENCY_CODE)
 * @param locale The locale for formatting (default: 'cs-CZ')
 * @returns Formatted price string
 */
export function formatPrice(
  price: number,
  currency: string = DEFAULT_CURRENCY_CODE,
  locale: string = 'cs-CZ',
): string {
  const normalizedCode = normalizeCurrencyCode(currency, DEFAULT_CURRENCY_CODE);
  const definition = getCurrencyFormatDefinition(normalizedCode);
  const formattedValue = formatPriceValue(price, locale);
  return `${definition.prefix || ''}${formattedValue}${definition.suffix || ''}`;
}

/**
 * Format a price value without currency symbol
 * @param price The price to format
 * @param locale The locale for formatting (default: 'cs-CZ')
 * @returns Formatted price string without currency
 */
export function formatPriceValue(price: number, locale: string = 'cs-CZ'): string {
  return price.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse a price string to a number
 * @param input The input string to parse
 * @returns The parsed number or NaN if invalid
 */
export function parsePrice(input: string): number {
  // Remove spaces and replace comma with dot
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  return parseFloat(normalized);
}

/**
 * Validate a price input
 * @param input The input string to validate
 * @returns True if the input is a valid price
 */
export function isValidPrice(input: string): boolean {
  const price = parsePrice(input);
  return !isNaN(price) && price > 0;
}
