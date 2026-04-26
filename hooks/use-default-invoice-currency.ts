import { useEffect, useState } from 'react';

import { observeSettings } from '@/repositories/settings-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';

export function useDefaultInvoiceCurrency() {
  const [defaultInvoiceCurrency, setDefaultInvoiceCurrency] = useState('CZK');

  useEffect(() => {
    return observeSettings(
      (settings) => {
        setDefaultInvoiceCurrency(normalizeCurrencyCode(settings?.defaultInvoiceCurrency));
      },
      ['default_invoice_currency'],
    );
  }, []);

  return defaultInvoiceCurrency;
}
