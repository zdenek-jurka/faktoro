import database from '@/db';
import CurrencySettingModel from '@/model/CurrencySettingModel';
import { ensureCurrencySettingsSeeded } from '@/repositories/currency-settings-repository';
import { Q } from '@nozbe/watermelondb';
import { useEffect, useState } from 'react';

export function useCurrencySettings(includeInactive: boolean = false) {
  const [currencies, setCurrencies] = useState<CurrencySettingModel[]>([]);

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | undefined;

    const load = async () => {
      await ensureCurrencySettingsSeeded();
      if (!isMounted) return;

      const query = includeInactive
        ? database
            .get<CurrencySettingModel>(CurrencySettingModel.table)
            .query(Q.sortBy('sort_order', Q.asc), Q.sortBy('code', Q.asc))
        : database
            .get<CurrencySettingModel>(CurrencySettingModel.table)
            .query(
              Q.where('is_active', true),
              Q.sortBy('sort_order', Q.asc),
              Q.sortBy('code', Q.asc),
            );

      subscription = query.observe().subscribe(setCurrencies);
    };

    void load();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [includeInactive]);

  return currencies;
}
