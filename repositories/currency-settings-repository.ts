import database from '@/db';
import { AppSettingsModel, InvoiceModel, PriceListItemModel, TimeEntryModel } from '@/model';
import ClientPriceOverrideModel from '@/model/ClientPriceOverrideModel';
import CurrencySettingModel from '@/model/CurrencySettingModel';
import {
  DEFAULT_CURRENCY_CODE,
  type CurrencyFormatDefinition,
  normalizeCurrencyCode,
  setCurrencyFormatDefinitions,
} from '@/utils/currency-utils';
import { Q } from '@nozbe/watermelondb';

export const CURRENCY_SETTING_DUPLICATE_CODE = 'CURRENCY_SETTING_DUPLICATE_CODE';
export const CURRENCY_SETTING_IN_USE = 'CURRENCY_SETTING_IN_USE';
export const CURRENCY_SETTING_LAST_REMAINING = 'CURRENCY_SETTING_LAST_REMAINING';

export type UpsertCurrencySettingInput = {
  id?: string;
  code: string;
  prefix?: string | null;
  suffix?: string | null;
  isActive?: boolean;
};

export const DEFAULT_CURRENCY_SETTINGS: CurrencyFormatDefinition[] = [
  { code: 'EUR', prefix: '€', suffix: '', isActive: true, sortOrder: 10 },
  { code: 'CZK', prefix: '', suffix: ' Kč', isActive: true, sortOrder: 20 },
  { code: 'USD', prefix: '$', suffix: '', isActive: true, sortOrder: 30 },
  { code: 'CHF', prefix: '', suffix: ' CHF', isActive: true, sortOrder: 40 },
];

let currencySeedPromise: Promise<CurrencySettingModel[]> | null = null;

function toCurrencyDefinition(setting: CurrencySettingModel): CurrencyFormatDefinition {
  return {
    code: normalizeCurrencyCode(setting.code, DEFAULT_CURRENCY_CODE),
    prefix: setting.prefix || '',
    suffix: setting.suffix || '',
    sortOrder: setting.sortOrder || 0,
    isActive: !!setting.isActive,
  };
}

function cleanAffix(value?: string | null): string {
  return (value || '').replace(/\r\n/g, '\n');
}

export async function ensureCurrencySettingsSeeded(): Promise<CurrencySettingModel[]> {
  if (currencySeedPromise) {
    return currencySeedPromise;
  }

  currencySeedPromise = (async () => {
    const collection = database.get<CurrencySettingModel>(CurrencySettingModel.table);
    const existing = await collection.query(Q.sortBy('sort_order', Q.asc)).fetch();
    if (existing.length > 0) {
      setCurrencyFormatDefinitions(existing.map(toCurrencyDefinition));
      return existing;
    }

    await database.write(async () => {
      const currentRows = await collection.query(Q.sortBy('sort_order', Q.asc)).fetch();
      if (currentRows.length > 0) {
        return;
      }

      const operations = DEFAULT_CURRENCY_SETTINGS.map((currency) =>
        collection.prepareCreate((record: CurrencySettingModel) => {
          record.code = currency.code;
          record.prefix = currency.prefix || undefined;
          record.suffix = currency.suffix || undefined;
          record.sortOrder = currency.sortOrder;
          record.isActive = currency.isActive;
        }),
      );
      await database.batch(...operations);
    });

    const seeded = await collection.query(Q.sortBy('sort_order', Q.asc)).fetch();
    setCurrencyFormatDefinitions(seeded.map(toCurrencyDefinition));
    return seeded;
  })();

  try {
    return await currencySeedPromise;
  } finally {
    currencySeedPromise = null;
  }
}

export async function getCurrencySettings(
  includeInactive: boolean = true,
): Promise<CurrencySettingModel[]> {
  await ensureCurrencySettingsSeeded();
  const collection = database.get<CurrencySettingModel>(CurrencySettingModel.table);
  const query = includeInactive
    ? collection.query(Q.sortBy('sort_order', Q.asc), Q.sortBy('code', Q.asc))
    : collection.query(
        Q.where('is_active', true),
        Q.sortBy('sort_order', Q.asc),
        Q.sortBy('code', Q.asc),
      );
  const settings = await query.fetch();
  const allSettings = includeInactive
    ? settings
    : await collection.query(Q.sortBy('sort_order', Q.asc), Q.sortBy('code', Q.asc)).fetch();
  setCurrencyFormatDefinitions(allSettings.map(toCurrencyDefinition));
  return settings;
}

export async function getActiveCurrencySettings(): Promise<CurrencySettingModel[]> {
  return getCurrencySettings(false);
}

export async function getCurrencyFormatDefinitions(
  includeInactive: boolean = true,
): Promise<CurrencyFormatDefinition[]> {
  const settings = await getCurrencySettings(includeInactive);
  return settings.map(toCurrencyDefinition);
}

export async function upsertCurrencySetting(
  input: UpsertCurrencySettingInput,
): Promise<CurrencySettingModel> {
  const collection = database.get<CurrencySettingModel>(CurrencySettingModel.table);
  const normalizedCode = normalizeCurrencyCode(input.code, DEFAULT_CURRENCY_CODE);
  await ensureCurrencySettingsSeeded();

  const saved = await database.write(async () => {
    const existingByCode = await collection.query(Q.where('code', normalizedCode)).fetch();
    if (!input.id && existingByCode.length > 0) {
      throw new Error(CURRENCY_SETTING_DUPLICATE_CODE);
    }

    const existing = input.id ? await collection.find(input.id) : null;

    if (existing) {
      const duplicate = existingByCode.find((row) => row.id !== existing.id);
      if (duplicate) throw new Error(CURRENCY_SETTING_DUPLICATE_CODE);
    }

    if (existing) {
      await existing.update((record: CurrencySettingModel) => {
        record.code = normalizedCode;
        record.prefix = cleanAffix(input.prefix) || undefined;
        record.suffix = cleanAffix(input.suffix) || undefined;
        if (input.isActive !== undefined) record.isActive = input.isActive;
      });
      return existing;
    } else {
      const all = await collection.query(Q.sortBy('sort_order', Q.desc)).fetch();
      const nextSortOrder = (all[0]?.sortOrder || 0) + 10;
      return await collection.create((record: CurrencySettingModel) => {
        record.code = normalizedCode;
        record.prefix = cleanAffix(input.prefix) || undefined;
        record.suffix = cleanAffix(input.suffix) || undefined;
        record.sortOrder = nextSortOrder;
        record.isActive = input.isActive ?? true;
      });
    }
  });

  await getCurrencySettings(true);
  return saved;
}

export async function deleteCurrencySetting(id: string): Promise<void> {
  const collection = database.get<CurrencySettingModel>(CurrencySettingModel.table);
  const settingsCollection = database.get<AppSettingsModel>(AppSettingsModel.table);
  const priceListCollection = database.get<PriceListItemModel>(PriceListItemModel.table);
  const overrideCollection = database.get<ClientPriceOverrideModel>(ClientPriceOverrideModel.table);
  const timeEntryCollection = database.get<TimeEntryModel>(TimeEntryModel.table);
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);

  await ensureCurrencySettingsSeeded();

  await database.write(async () => {
    const currency = await collection.find(id);
    const normalizedCode = normalizeCurrencyCode(currency.code, DEFAULT_CURRENCY_CODE);

    const activeCurrencies = await collection.query(Q.where('is_active', true)).fetchCount();
    if (activeCurrencies <= 1) {
      throw new Error(CURRENCY_SETTING_LAST_REMAINING);
    }

    const [defaultCurrencyUsage, priceListUsage, overrideUsage, timeEntryUsage, invoiceUsage] =
      await Promise.all([
        settingsCollection.query(Q.where('default_invoice_currency', normalizedCode)).fetchCount(),
        priceListCollection.query(Q.where('default_price_currency', normalizedCode)).fetchCount(),
        overrideCollection.query(Q.where('custom_price_currency', normalizedCode)).fetchCount(),
        timeEntryCollection.query(Q.where('rate_currency', normalizedCode)).fetchCount(),
        invoiceCollection.query(Q.where('currency', normalizedCode)).fetchCount(),
      ]);

    const usageCount =
      defaultCurrencyUsage + priceListUsage + overrideUsage + timeEntryUsage + invoiceUsage;

    if (usageCount > 0) {
      throw new Error(CURRENCY_SETTING_IN_USE);
    }

    await currency.markAsDeleted();
  });

  await getCurrencySettings(true);
}

export async function setupCurrencyFormatCacheSync(): Promise<{ remove: () => void }> {
  await ensureCurrencySettingsSeeded();
  const subscription = database
    .get<CurrencySettingModel>(CurrencySettingModel.table)
    .query(Q.sortBy('sort_order', Q.asc), Q.sortBy('code', Q.asc))
    .observeWithColumns(['code', 'sort_order', 'is_active', 'prefix', 'suffix'])
    .subscribe((rows) => {
      setCurrencyFormatDefinitions(rows.map(toCurrencyDefinition));
    });

  return {
    remove: () => subscription.unsubscribe(),
  };
}
