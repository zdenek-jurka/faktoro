type VatRateWindow = {
  validFrom: number;
  validTo?: number | null;
  ratePercent: number;
};

export function resolveVatRateForDate<T extends VatRateWindow>(
  rates: T[],
  taxableAt: number,
): number | null {
  const matching = rates.filter(
    (rate) => rate.validFrom <= taxableAt && (rate.validTo == null || rate.validTo >= taxableAt),
  );
  if (matching.length === 0) return null;

  matching.sort((a, b) => b.validFrom - a.validFrom);
  return matching[0].ratePercent;
}

export function formatVatRatePercent(ratePercent: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(ratePercent) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(ratePercent);
}
