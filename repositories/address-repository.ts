import database from '@/db';
import { AddressType } from '@/db/schema';
import ClientAddressModel from '@/model/ClientAddressModel';
import { Q } from '@nozbe/watermelondb';

export type CreateAddressInput = {
  clientId: string;
  type: AddressType;
  street: string;
  street2?: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type UpdateAddressInput = {
  id: string;
  type: AddressType;
  street: string;
  street2?: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type UpsertDefaultBillingAddressInput = {
  clientId: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

export async function createAddress(input: CreateAddressInput): Promise<void> {
  const addresses = database.get<ClientAddressModel>(ClientAddressModel.table);

  // Fetch existing addresses BEFORE entering write transaction
  const existingAddresses = input.isDefault
    ? await addresses.query(Q.where('client_id', input.clientId)).fetch()
    : [];

  await database.write(async () => {
    // If this address is marked as default, unset other defaults for this client
    if (input.isDefault) {
      for (const addr of existingAddresses) {
        if (addr.isDefault) {
          await addr.update((a: ClientAddressModel) => {
            a.isDefault = false;
          });
        }
      }
    }

    await addresses.create((a: ClientAddressModel) => {
      a.clientId = input.clientId;
      a.type = input.type;
      a.street = input.street;
      a.street2 = input.street2 || '';
      a.city = input.city;
      a.postalCode = input.postalCode;
      a.country = input.country;
      a.isDefault = input.isDefault;
    });
  });
}

export async function updateAddress(input: UpdateAddressInput): Promise<void> {
  const addresses = database.get<ClientAddressModel>(ClientAddressModel.table);

  // Fetch address BEFORE entering write transaction
  const address = await addresses.find(input.id);

  // Fetch existing addresses if needed BEFORE entering write transaction
  const existingAddresses =
    input.isDefault && !address.isDefault
      ? await addresses.query(Q.where('client_id', address.clientId)).fetch()
      : [];

  await database.write(async () => {
    // If this address is marked as default, unset other defaults for this client
    if (input.isDefault && !address.isDefault) {
      for (const addr of existingAddresses) {
        if (addr.id !== input.id && addr.isDefault) {
          await addr.update((a: ClientAddressModel) => {
            a.isDefault = false;
          });
        }
      }
    }

    await address.update((a: ClientAddressModel) => {
      a.type = input.type;
      a.street = input.street;
      a.street2 = input.street2 || '';
      a.city = input.city;
      a.postalCode = input.postalCode;
      a.country = input.country;
      a.isDefault = input.isDefault;
    });
  });
}

export async function deleteAddress(id: string): Promise<void> {
  const addresses = database.get<ClientAddressModel>(ClientAddressModel.table);

  await database.write(async () => {
    const address = await addresses.find(id);
    await address.markAsDeleted();
  });
}

export async function upsertDefaultBillingAddressForClient(
  input: UpsertDefaultBillingAddressInput,
): Promise<void> {
  const addresses = database.get<ClientAddressModel>(ClientAddressModel.table);
  const existingAddresses = await addresses.query(Q.where('client_id', input.clientId)).fetch();

  await database.write(async () => {
    let defaultBillingAddress: ClientAddressModel | undefined;
    for (const address of existingAddresses) {
      if (address.type === AddressType.BILLING && address.isDefault) {
        defaultBillingAddress = address;
        break;
      }
    }

    for (const address of existingAddresses) {
      if (address.id !== defaultBillingAddress?.id && address.isDefault) {
        await address.update((a: ClientAddressModel) => {
          a.isDefault = false;
        });
      }
    }

    if (defaultBillingAddress) {
      await defaultBillingAddress.update((a: ClientAddressModel) => {
        a.type = AddressType.BILLING;
        a.street = input.street;
        a.street2 = '';
        a.city = input.city;
        a.postalCode = input.postalCode;
        a.country = input.country;
        a.isDefault = true;
      });
      return;
    }

    await addresses.create((a: ClientAddressModel) => {
      a.clientId = input.clientId;
      a.type = AddressType.BILLING;
      a.street = input.street;
      a.street2 = '';
      a.city = input.city;
      a.postalCode = input.postalCode;
      a.country = input.country;
      a.isDefault = true;
    });
  });
}

export async function getPreferredInvoiceAddress(
  clientId: string,
): Promise<ClientAddressModel | null> {
  const addresses = await database
    .get<ClientAddressModel>(ClientAddressModel.table)
    .query(Q.where('client_id', clientId))
    .fetch();

  if (addresses.length === 0) return null;

  const defaultBilling =
    addresses.find((address) => address.type === AddressType.BILLING && address.isDefault) ?? null;
  if (defaultBilling) return defaultBilling;

  const anyDefault = addresses.find((address) => address.isDefault) ?? null;
  if (anyDefault) return anyDefault;

  const firstBilling = addresses.find((address) => address.type === AddressType.BILLING) ?? null;
  if (firstBilling) return firstBilling;

  return addresses[0] ?? null;
}
