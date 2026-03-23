import { useEffect, useState } from 'react';

import database from '@/db';
import AppSettingsModel from '@/model/AppSettingsModel';
import { getSettings } from '@/repositories/settings-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';

export function useDefaultInvoiceCurrency() {
  const [defaultInvoiceCurrency, setDefaultInvoiceCurrency] = useState('CZK');

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        if (!isMounted) return;
        setDefaultInvoiceCurrency(normalizeCurrencyCode(settings.defaultInvoiceCurrency));
      } catch (error) {
        console.error('Error loading default invoice currency:', error);
      }
    };

    void loadSettings();

    const subscription = database
      .get<AppSettingsModel>(AppSettingsModel.table)
      .query()
      .observe()
      .subscribe((allSettings) => {
        setDefaultInvoiceCurrency(normalizeCurrencyCode(allSettings[0]?.defaultInvoiceCurrency));
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return defaultInvoiceCurrency;
}
