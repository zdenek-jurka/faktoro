type InvoiceLikeLineItem = {
  totalPrice: number;
  vatRate?: number | null;
};

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateLineItemTotals<T extends InvoiceLikeLineItem>(
  items: T[],
  includeVat: boolean,
): {
  subtotal: number;
  vatTotal: number;
  total: number;
} {
  const subtotal = roundCurrency(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const vatTotal = includeVat
    ? roundCurrency(
        items.reduce((sum, item) => {
          const rate = item.vatRate ?? 0;
          return sum + item.totalPrice * (rate / 100);
        }, 0),
      )
    : 0;

  return {
    subtotal,
    vatTotal,
    total: roundCurrency(subtotal + vatTotal),
  };
}
