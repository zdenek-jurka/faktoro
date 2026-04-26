export type StreetAndBuildingNumber = {
  streetName: string;
  buildingNumber: string;
  inferred: boolean;
};

function compactAddress(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export function splitStreetAndBuildingNumber(address?: string): StreetAndBuildingNumber {
  const normalized = compactAddress(address);
  if (!normalized) {
    return { streetName: '', buildingNumber: '', inferred: false };
  }

  const trailingNumberMatch = normalized.match(
    /^(.*?\S)\s+((?:č\.?\s*p\.?\s*)?\d+[A-Za-zÁ-ž]?(?:[/-]\d+[A-Za-zÁ-ž]?)?)$/i,
  );
  if (trailingNumberMatch?.[1] && trailingNumberMatch[2]) {
    return {
      streetName: trailingNumberMatch[1],
      buildingNumber: trailingNumberMatch[2],
      inferred: true,
    };
  }

  const leadingNumberMatch = normalized.match(
    /^((?:č\.?\s*p\.?\s*)?\d+[A-Za-zÁ-ž]?(?:[/-]\d+[A-Za-zÁ-ž]?)?)\s+(.+?\S)$/i,
  );
  if (leadingNumberMatch?.[1] && leadingNumberMatch[2]) {
    return {
      streetName: leadingNumberMatch[2],
      buildingNumber: leadingNumberMatch[1],
      inferred: true,
    };
  }

  return { streetName: normalized, buildingNumber: '-', inferred: false };
}
