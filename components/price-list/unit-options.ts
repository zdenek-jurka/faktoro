export const PRICE_LIST_UNITS = ['hour', 'piece', 'project', 'day', 'custom'] as const;

type UnitOptionLocalization = {
  priceList: {
    units: {
      hour: () => string;
      piece: () => string;
      project: () => string;
      day: () => string;
      custom: () => string;
    };
  };
};

export function getPriceListUnitLabel(LL: UnitOptionLocalization, unit: string): string {
  if (unit === 'hour') return LL.priceList.units.hour();
  if (unit === 'piece') return LL.priceList.units.piece();
  if (unit === 'project') return LL.priceList.units.project();
  if (unit === 'day') return LL.priceList.units.day();
  if (unit === 'custom') return LL.priceList.units.custom();
  return unit;
}
