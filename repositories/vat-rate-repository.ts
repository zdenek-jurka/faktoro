import database from '@/db';
import { PriceListItemModel, VatCodeModel, VatRateModel } from '@/model';
import { Q } from '@nozbe/watermelondb';
const DAY_MS = 24 * 60 * 60 * 1000;
export const VAT_VALID_FROM_BEGINNING_TS = -62135596800000; // 0001-01-01T00:00:00.000Z

export type CreateVatRateInput = {
  codeName: string;
  ratePercent: number;
  validFrom?: number | null;
  validTo?: number | null;
};

export type UpdateVatRateInput = {
  id: string;
  codeName: string;
  ratePercent: number;
  validFrom?: number | null;
  validTo?: number | null;
};

export type ReplaceAllVatRatesInput = {
  codeName: string;
  countryCode?: string | null;
  matchNames?: string[];
  ratePercent: number;
  validFrom?: number | null;
  validTo?: number | null;
}[];

const normalizeName = (name: string) => name.trim().toLocaleLowerCase();

export function getVatCodes() {
  return database.get<VatCodeModel>(VatCodeModel.table).query(Q.sortBy('name', Q.asc));
}

export async function createVatCode(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  await database.write(async () => {
    const existing = await findVatCodeByName(trimmed);
    if (existing) return;

    const collection = database.get<VatCodeModel>(VatCodeModel.table);
    await collection.create((item: VatCodeModel) => {
      item.name = trimmed;
    });
  });
}

export function getVatRates() {
  return database
    .get<VatRateModel>(VatRateModel.table)
    .query(Q.sortBy('vat_code_id', Q.asc), Q.sortBy('valid_from', Q.desc));
}

async function findVatCodeByName(name: string): Promise<VatCodeModel | null> {
  const collection = database.get<VatCodeModel>(VatCodeModel.table);
  const items = await collection.query().fetch();
  const normalized = normalizeName(name);
  return items.find((item) => normalizeName(item.name) === normalized) || null;
}

export async function renameVatCode(codeId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const codeCollection = database.get<VatCodeModel>(VatCodeModel.table);
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);

  await database.write(async () => {
    const currentCode = await codeCollection.find(codeId);
    const existing = await findVatCodeByName(trimmed);

    if (existing && existing.id !== currentCode.id) {
      const rates = await rateCollection.query(Q.where('vat_code_id', currentCode.id)).fetch();
      for (const rate of rates) {
        await rate.update((record: VatRateModel) => {
          record.vatCodeId = existing.id;
        });
      }
      await currentCode.markAsDeleted();
      return;
    }

    await currentCode.update((record: VatCodeModel) => {
      record.name = trimmed;
    });
  });
}

export async function deleteVatCode(codeId: string): Promise<void> {
  const codeCollection = database.get<VatCodeModel>(VatCodeModel.table);
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);

  await database.write(async () => {
    const rates = await rateCollection.query(Q.where('vat_code_id', codeId)).fetch();
    for (const rate of rates) {
      await rate.markAsDeleted();
    }
    const code = await codeCollection.find(codeId);
    await code.markAsDeleted();
  });
}

async function getOrCreateVatCode(name: string): Promise<VatCodeModel> {
  const existing = await findVatCodeByName(name);
  if (existing) return existing;

  const collection = database.get<VatCodeModel>(VatCodeModel.table);
  return collection.create((item: VatCodeModel) => {
    item.name = name.trim();
  });
}

async function cleanupVatCodeIfUnused(vatCodeId?: string) {
  if (!vatCodeId) return;

  const rateCollection = database.get<VatRateModel>(VatRateModel.table);
  const count = await rateCollection.query(Q.where('vat_code_id', vatCodeId)).fetchCount();
  if (count > 0) return;

  const codeCollection = database.get<VatCodeModel>(VatCodeModel.table);
  const code = await codeCollection.find(vatCodeId);
  await code.markAsDeleted();
}

export async function createVatRate(input: CreateVatRateInput): Promise<void> {
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);
  await database.write(async () => {
    const code = await getOrCreateVatCode(input.codeName);
    const normalizedValidFrom = input.validFrom ?? VAT_VALID_FROM_BEGINNING_TS;

    const openEndedPreviousRates = await rateCollection
      .query(
        Q.where('vat_code_id', code.id),
        Q.where('valid_to', null),
        Q.where('valid_from', Q.lt(normalizedValidFrom)),
        Q.sortBy('valid_from', Q.desc),
      )
      .fetch();

    const previousOpenEndedRate = openEndedPreviousRates[0];
    if (previousOpenEndedRate) {
      const autoValidTo = normalizedValidFrom - DAY_MS;
      await previousOpenEndedRate.update((record: VatRateModel) => {
        record.validTo = autoValidTo;
      });
    }

    await rateCollection.create((item: VatRateModel) => {
      item.vatCodeId = code.id;
      item.ratePercent = input.ratePercent;
      item.validFrom = normalizedValidFrom;
      item.validTo = input.validTo ?? undefined;
    });
  });
}

export async function updateVatRate(input: UpdateVatRateInput): Promise<void> {
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);
  await database.write(async () => {
    const item = await rateCollection.find(input.id);
    const previousVatCodeId = item.vatCodeId;
    const code = await getOrCreateVatCode(input.codeName);
    const normalizedValidFrom = input.validFrom ?? VAT_VALID_FROM_BEGINNING_TS;

    await item.update((record: VatRateModel) => {
      record.vatCodeId = code.id;
      record.ratePercent = input.ratePercent;
      record.validFrom = normalizedValidFrom;
      record.validTo = input.validTo ?? undefined;
    });

    if (previousVatCodeId && previousVatCodeId !== code.id) {
      await cleanupVatCodeIfUnused(previousVatCodeId);
    }
  });
}

export async function deleteVatRate(id: string): Promise<void> {
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);
  await database.write(async () => {
    const item = await rateCollection.find(id);
    const vatCodeId = item.vatCodeId;
    await item.markAsDeleted();
    await cleanupVatCodeIfUnused(vatCodeId);
  });
}

export async function replaceAllVatRates(input: ReplaceAllVatRatesInput): Promise<void> {
  const codeCollection = database.get<VatCodeModel>(VatCodeModel.table);
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);
  const priceListCollection = database.get<PriceListItemModel>(PriceListItemModel.table);

  await database.write(async () => {
    const existingRates = await rateCollection.query().fetch();
    for (const rate of existingRates) {
      await rate.markAsDeleted();
    }

    const existingCodes = await codeCollection.query().fetch();
    const existingCodeByNormalizedName = new Map<string, VatCodeModel>();
    existingCodes.forEach((code) => {
      existingCodeByNormalizedName.set(normalizeName(code.name), code);
    });

    const createdCodes = new Map<string, VatCodeModel>();
    const matchedCodeIds = new Set<string>();

    for (const item of input) {
      const normalizedCodeName = item.codeName.trim();
      if (!normalizedCodeName) continue;

      let code: VatCodeModel | undefined = createdCodes.get(normalizedCodeName);
      if (!code) {
        const aliasNames = [normalizedCodeName, ...(item.matchNames ?? [])]
          .map((name) => normalizeName(name))
          .filter(Boolean);
        code =
          aliasNames.map((alias) => existingCodeByNormalizedName.get(alias)).find(Boolean) ??
          undefined;

        if (code) {
          await code.update((record: VatCodeModel) => {
            record.name = normalizedCodeName;
            record.countryCode = item.countryCode ?? null;
          });
        } else {
          code = await codeCollection.create((record: VatCodeModel) => {
            record.name = normalizedCodeName;
            record.countryCode = item.countryCode ?? null;
          });
        }

        createdCodes.set(normalizedCodeName, code);
        matchedCodeIds.add(code.id);
      }

      await rateCollection.create((record: VatRateModel) => {
        record.vatCodeId = code.id;
        record.ratePercent = item.ratePercent;
        record.validFrom = item.validFrom ?? VAT_VALID_FROM_BEGINNING_TS;
        record.validTo = item.validTo ?? undefined;
      });
    }

    for (const code of existingCodes) {
      if (matchedCodeIds.has(code.id)) continue;

      const referencingPriceItems = await priceListCollection
        .query(Q.where('vat_code_id', code.id))
        .fetchCount();
      if (referencingPriceItems > 0) continue;

      await code.markAsDeleted();
    }
  });
}

export async function addVatRates(input: ReplaceAllVatRatesInput): Promise<void> {
  const codeCollection = database.get<VatCodeModel>(VatCodeModel.table);
  const rateCollection = database.get<VatRateModel>(VatRateModel.table);

  await database.write(async () => {
    const existingCodes = await codeCollection.query().fetch();
    const existingRates = await rateCollection.query().fetch();
    const existingCodeByNormalizedName = new Map<string, VatCodeModel>();
    existingCodes.forEach((code) => {
      existingCodeByNormalizedName.set(normalizeName(code.name), code);
    });
    const existingRateKeys = new Set(
      existingRates.map((rate) =>
        [
          rate.vatCodeId || '',
          String(rate.ratePercent),
          String(rate.validFrom ?? VAT_VALID_FROM_BEGINNING_TS),
          String(rate.validTo ?? ''),
        ].join('::'),
      ),
    );

    const processedCodes = new Map<string, VatCodeModel>();

    for (const item of input) {
      const normalizedCodeName = item.codeName.trim();
      if (!normalizedCodeName) continue;

      let code: VatCodeModel | undefined = processedCodes.get(normalizedCodeName);
      if (!code) {
        const aliasNames = [normalizedCodeName, ...(item.matchNames ?? [])]
          .map((name) => normalizeName(name))
          .filter(Boolean);
        code =
          aliasNames.map((alias) => existingCodeByNormalizedName.get(alias)).find(Boolean) ??
          undefined;

        if (!code) {
          code = await codeCollection.create((record: VatCodeModel) => {
            record.name = normalizedCodeName;
            record.countryCode = item.countryCode ?? null;
          });
        }

        processedCodes.set(normalizedCodeName, code);
      }

      const validFrom = item.validFrom ?? VAT_VALID_FROM_BEGINNING_TS;
      const validTo = item.validTo ?? undefined;
      const rateKey = [
        code.id,
        String(item.ratePercent),
        String(validFrom),
        String(validTo ?? ''),
      ].join('::');
      if (existingRateKeys.has(rateKey)) {
        continue;
      }

      await rateCollection.create((record: VatRateModel) => {
        record.vatCodeId = code.id;
        record.ratePercent = item.ratePercent;
        record.validFrom = validFrom;
        record.validTo = validTo;
      });
      existingRateKeys.add(rateKey);
    }
  });
}
