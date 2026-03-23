import database from '@/db';
import ClientPriceOverrideModel from '@/model/ClientPriceOverrideModel';
import PriceListItemModel from '@/model/PriceListItemModel';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';

export type CreateClientPriceOverrideInput = {
  clientId: string;
  priceListItemId: string;
  customPrice: number;
  customPriceCurrency?: string | null;
};

export type UpdateClientPriceOverrideInput = {
  id: string;
  customPrice: number;
  customPriceCurrency?: string | null;
};

export type EffectivePriceDetails = {
  price: number;
  currency: string;
};

export async function createClientPriceOverride(
  input: CreateClientPriceOverrideInput,
): Promise<ClientPriceOverrideModel> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);

  return await database.write(async () => {
    const priceListItem = await priceListItems.find(input.priceListItemId);
    return await clientPriceOverrides.create((override: ClientPriceOverrideModel) => {
      override.clientId = input.clientId;
      override.priceListItemId = input.priceListItemId;
      override.customPrice = input.customPrice;
      override.customPriceCurrency = normalizeCurrencyCode(
        input.customPriceCurrency,
        priceListItem.defaultPriceCurrency || DEFAULT_CURRENCY_CODE,
      );
    });
  });
}

export async function updateClientPriceOverride(
  input: UpdateClientPriceOverrideInput,
): Promise<void> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );
  const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);

  await database.write(async () => {
    const override = await clientPriceOverrides.find(input.id);
    const priceListItem = await priceListItems.find(override.priceListItemId);
    await override.update((o: ClientPriceOverrideModel) => {
      o.customPrice = input.customPrice;
      o.customPriceCurrency = normalizeCurrencyCode(
        input.customPriceCurrency,
        priceListItem.defaultPriceCurrency || DEFAULT_CURRENCY_CODE,
      );
    });
  });
}

export async function deleteClientPriceOverride(id: string): Promise<void> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );

  await database.write(async () => {
    const override = await clientPriceOverrides.find(id);
    await override.markAsDeleted();
  });
}

export function getClientPriceOverrides(clientId: string): Query<ClientPriceOverrideModel> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );

  return clientPriceOverrides.query(Q.where('client_id', clientId));
}

export function getPriceListItemOverrides(
  priceListItemId: string,
): Query<ClientPriceOverrideModel> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );

  return clientPriceOverrides.query(Q.where('price_list_item_id', priceListItemId));
}

export async function getClientPriceOverride(
  clientId: string,
  priceListItemId: string,
): Promise<ClientPriceOverrideModel | null> {
  const clientPriceOverrides = database.get<ClientPriceOverrideModel>(
    ClientPriceOverrideModel.table,
  );

  const overrides = await clientPriceOverrides
    .query(Q.where('client_id', clientId), Q.where('price_list_item_id', priceListItemId))
    .fetch();

  return overrides.length > 0 ? overrides[0] : null;
}

/**
 * Get the effective price for a client and price list item.
 * Returns custom price if override exists, otherwise returns default price from price list item.
 * Throws an error if the price list item is not found.
 */
export async function getEffectivePrice(
  clientId: string,
  priceListItemId: string,
): Promise<number> {
  const result = await getEffectivePriceDetails(clientId, priceListItemId);
  return result.price;
}

export async function getEffectivePriceDetails(
  clientId: string,
  priceListItemId: string,
): Promise<EffectivePriceDetails> {
  try {
    const priceListItems = database.get<PriceListItemModel>(PriceListItemModel.table);
    // Check for client-specific override
    const override = await getClientPriceOverride(clientId, priceListItemId);

    if (override) {
      const priceListItem = await priceListItems.find(override.priceListItemId);
      return {
        price: override.customPrice,
        currency: normalizeCurrencyCode(
          override.customPriceCurrency,
          priceListItem.defaultPriceCurrency || DEFAULT_CURRENCY_CODE,
        ),
      };
    }

    // Fall back to default price from price list item
    const priceListItem = await priceListItems.find(priceListItemId);

    return {
      price: priceListItem.defaultPrice,
      currency: normalizeCurrencyCode(priceListItem.defaultPriceCurrency),
    };
  } catch (error) {
    console.error('Error getting effective price:', error);
    throw new Error('Price list item not found or deleted');
  }
}
