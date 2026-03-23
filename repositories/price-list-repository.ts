import database from '@/db';
import ClientPriceOverrideModel from '@/model/ClientPriceOverrideModel';
import InvoiceItemModel from '@/model/InvoiceItemModel';
import PriceListItemModel from '@/model/PriceListItemModel';
import TimeEntryModel from '@/model/TimeEntryModel';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';

export type CreatePriceListItemInput = {
  name: string;
  description?: string | null;
  defaultPrice: number;
  defaultPriceCurrency?: string | null;
  unit: string;
  vatCodeId?: string | null;
  vatName?: string | null;
};

export type UpdatePriceListItemInput = {
  id: string;
  name: string;
  description?: string | null;
  defaultPrice: number;
  defaultPriceCurrency?: string | null;
  unit: string;
  vatCodeId?: string | null;
  vatName?: string | null;
  isActive: boolean;
};

export type PriceListItemDependencyCounts = {
  timeEntries: number;
  clientOverrides: number;
  invoiceItems: number;
};

export type DeletePriceListItemResult =
  | { status: 'deleted' }
  | { status: 'deactivated'; dependencyCounts: PriceListItemDependencyCounts };

export async function createPriceListItem(
  input: CreatePriceListItemInput,
): Promise<PriceListItemModel> {
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);

  return await database.write(async () => {
    return await priceListItems.create((item: PriceListItemModel) => {
      item.name = input.name;
      item.description = input.description || undefined;
      item.defaultPrice = input.defaultPrice;
      item.defaultPriceCurrency = normalizeCurrencyCode(input.defaultPriceCurrency);
      item.unit = input.unit;
      item.vatCodeId = input.vatCodeId || undefined;
      item.vatName = input.vatName || undefined;
      item.isActive = true;
    });
  });
}

export async function updatePriceListItem(input: UpdatePriceListItemInput): Promise<void> {
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);

  await database.write(async () => {
    const item = await priceListItems.find(input.id);
    await item.update((i: PriceListItemModel) => {
      i.name = input.name;
      i.description = input.description || undefined;
      i.defaultPrice = input.defaultPrice;
      i.defaultPriceCurrency = normalizeCurrencyCode(input.defaultPriceCurrency);
      i.unit = input.unit;
      i.vatCodeId = input.vatCodeId || undefined;
      i.vatName = input.vatName || undefined;
      i.isActive = input.isActive;
    });

    const linkedOverrides = await database
      .get<ClientPriceOverrideModel>(ClientPriceOverrideModel.table)
      .query(Q.where('price_list_item_id', input.id))
      .fetch();
    const normalizedCurrency = normalizeCurrencyCode(input.defaultPriceCurrency);
    for (const override of linkedOverrides) {
      await override.update((record: ClientPriceOverrideModel) => {
        record.customPriceCurrency = normalizedCurrency;
      });
    }
  });
}

async function getPriceListItemDependencyCounts(
  id: string,
): Promise<PriceListItemDependencyCounts> {
  const [timeEntries, clientOverrides, invoiceItems] = await Promise.all([
    database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('price_list_item_id', id))
      .fetchCount(),
    database
      .get<ClientPriceOverrideModel>(ClientPriceOverrideModel.table)
      .query(Q.where('price_list_item_id', id))
      .fetchCount(),
    database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('source_kind', 'price_list'), Q.where('source_id', id))
      .fetchCount(),
  ]);

  return { timeEntries, clientOverrides, invoiceItems };
}

export async function deletePriceListItem(id: string): Promise<DeletePriceListItemResult> {
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);
  const dependencyCounts = await getPriceListItemDependencyCounts(id);
  const hasDependencies =
    dependencyCounts.timeEntries > 0 ||
    dependencyCounts.clientOverrides > 0 ||
    dependencyCounts.invoiceItems > 0;

  if (hasDependencies) {
    await database.write(async () => {
      const item = await priceListItems.find(id);
      await item.update((i: PriceListItemModel) => {
        i.isActive = false;
      });
    });
    return { status: 'deactivated', dependencyCounts };
  }

  await database.write(async () => {
    const item = await priceListItems.find(id);
    await item.markAsDeleted();
  });

  return { status: 'deleted' };
}

export function getPriceListItems(includeInactive: boolean = false): Query<PriceListItemModel> {
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);

  if (includeInactive) {
    return priceListItems.query(Q.sortBy('name', Q.asc));
  }

  return priceListItems.query(Q.where('is_active', true), Q.sortBy('name', Q.asc));
}

export async function getPriceListItem(id: string): Promise<PriceListItemModel> {
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);
  return await priceListItems.find(id);
}
