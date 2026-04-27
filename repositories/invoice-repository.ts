import database from '@/db';
import {
  AppSettingsModel,
  ClientModel,
  InvoiceItemModel,
  InvoiceModel,
  PriceListItemModel,
  TimeEntryModel,
  TimesheetModel,
  VatCodeModel,
  VatRateModel,
} from '@/model';
import { getPreferredInvoiceAddress } from '@/repositories/address-repository';
import { getDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import type { BuyerSnapshot, SellerSnapshot } from '@/templates/invoice/xml';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import { buildSellerSnapshotFromSettings } from '@/utils/invoice-seller-snapshot';
import { normalizeBuyerSnapshot } from '@/utils/invoice-buyer';
import { isInvoiceVatPayer, type InvoiceCancellationMode } from '@/utils/invoice-status';
import { calculateLineItemTotals } from '@/utils/money';
import { buildSeriesIdentifier } from '@/utils/series-utils';
import { resolveVatRateForDate } from '@/utils/vat-rate-utils';
import { Q } from '@nozbe/watermelondb';

export type DraftInvoiceItemInput = {
  sourceKind: 'timesheet' | 'price_list' | 'manual';
  sourceId?: string;
  sourceEntryId?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  vatCodeId?: string;
  vatRate?: number;
};

export type CreateInvoiceInput = {
  clientId: string;
  buyerSnapshot?: BuyerSnapshot;
  invoiceNumber: string;
  buyerReference?: string;
  issuedAt: number;
  taxableAt?: number;
  dueAt?: number;
  currency: string;
  paymentMethod?: string;
  headerNote?: string;
  footerNote?: string;
  items: DraftInvoiceItemInput[];
};

export type UpdateIssuedInvoiceInput = CreateInvoiceInput & {
  id: string;
  refreshSellerSnapshot?: boolean;
};

export type CancelInvoiceInput = {
  id: string;
  mode: InvoiceCancellationMode;
  reason: string;
};

export const INVOICE_TAXABLE_DATE_REQUIRED_ERROR = 'invoice.taxable_date_required';
export const INVOICE_NUMBER_EXISTS_ERROR = 'invoice.number_exists';
export const INVOICE_CANCELLATION_REASON_REQUIRED_ERROR = 'invoice.cancellation_reason_required';
export const INVOICE_CANCELLATION_INVALID_STATE_ERROR = 'invoice.cancellation_invalid_state';
export const INVOICE_CANCELLATION_ALREADY_EXISTS_ERROR = 'invoice.cancellation_already_exists';
export const INVOICE_DELETE_INVALID_STATE_ERROR = 'invoice.delete_invalid_state';

type ResolvedInvoiceWriteData = {
  buyerSnapshot: BuyerSnapshot;
  sellerSnapshot: SellerSnapshot;
  normalizedItems: DraftInvoiceItemInput[];
  totals: {
    subtotal: number;
    total: number;
  };
  normalizedCurrency: string;
  normalizedPaymentMethod?: string;
  normalizedBuyerReference?: string;
  normalizedHeaderNote?: string;
  normalizedFooterNote?: string;
};

function normalizeVatName(value?: string): string {
  return (value || '').trim().toLocaleLowerCase();
}

function buildInvoiceNumberFromSettings(
  settings?: AppSettingsModel,
  deviceSettings?: {
    syncDeviceName?: string;
    syncDeviceId?: string;
  },
  nextNumberOverride?: number,
): string {
  return buildSeriesIdentifier({
    pattern: settings?.invoiceSeriesPattern,
    fallbackPattern: 'YY####',
    prefix: settings?.invoiceSeriesPrefix,
    nextNumber: nextNumberOverride ?? settings?.invoiceSeriesNextNumber,
    padding: settings?.invoiceSeriesPadding,
    perDevice: settings?.invoiceSeriesPerDevice,
    deviceCode: settings?.invoiceSeriesDeviceCode,
    syncDeviceName: deviceSettings?.syncDeviceName,
    syncDeviceId: deviceSettings?.syncDeviceId,
    fallbackPrefix: 'INV',
  });
}

function toLocalDayStart(value = Date.now()): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getCurrentInvoiceSeriesNextNumber(settings?: AppSettingsModel): number {
  return Math.max(1, Math.floor(settings?.invoiceSeriesNextNumber || 1));
}

async function resolveNextAvailableInvoiceNumber(
  invoiceCollection: ReturnType<typeof database.get<InvoiceModel>>,
  settings?: AppSettingsModel,
  deviceSettings?: {
    syncDeviceName?: string;
    syncDeviceId?: string;
  },
  disallowedNumbers: string[] = [],
): Promise<{ invoiceNumber: string; nextNumberUsed: number }> {
  const blockedNumbers = new Set(disallowedNumbers.filter(Boolean));
  let nextNumber = getCurrentInvoiceSeriesNextNumber(settings);

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = buildInvoiceNumberFromSettings(settings, deviceSettings, nextNumber);
    if (blockedNumbers.has(candidate)) {
      nextNumber += 1;
      continue;
    }

    const existing = await invoiceCollection
      .query(Q.where('invoice_number', candidate), Q.take(1))
      .fetch();
    if (existing.length === 0) {
      return { invoiceNumber: candidate, nextNumberUsed: nextNumber };
    }

    nextNumber += 1;
  }

  throw new Error('invoice.number_generation_failed');
}

async function assertInvoiceNumberAvailable(
  invoiceCollection: ReturnType<typeof database.get<InvoiceModel>>,
  invoiceNumber: string,
  excludeInvoiceId?: string,
): Promise<void> {
  const normalizedInvoiceNumber = invoiceNumber.trim();
  if (!normalizedInvoiceNumber) return;

  const existing = await invoiceCollection
    .query(Q.where('invoice_number', normalizedInvoiceNumber))
    .fetch();
  const duplicate = existing.find((invoice) => invoice.id !== excludeInvoiceId);
  if (duplicate) {
    throw new Error(INVOICE_NUMBER_EXISTS_ERROR);
  }
}

export async function getSuggestedInvoiceNumber(): Promise<string> {
  const settings = await getSettings();
  const deviceSettings = await getDeviceSyncSettings(settings);
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const { invoiceNumber } = await resolveNextAvailableInvoiceNumber(
    invoiceCollection,
    settings,
    deviceSettings,
  );
  return invoiceNumber;
}

export function getInvoices() {
  return database.get<InvoiceModel>(InvoiceModel.table).query(Q.sortBy('issued_at', Q.desc));
}

async function resolveInvoiceWriteData(
  input: CreateInvoiceInput,
  settings?: AppSettingsModel,
): Promise<ResolvedInvoiceWriteData> {
  const normalizedClientId = input.clientId.trim();
  const client = normalizedClientId
    ? await database.get<ClientModel>(ClientModel.table).find(normalizedClientId)
    : null;
  const buyerAddress = normalizedClientId
    ? await getPreferredInvoiceAddress(normalizedClientId)
    : null;
  if (settings?.isVatPayer && !input.taxableAt) {
    throw new Error(INVOICE_TAXABLE_DATE_REQUIRED_ERROR);
  }

  const isVatPayer = !!settings?.isVatPayer;
  const sellerSnapshot = buildSellerSnapshotFromSettings(settings, client);
  const buyerSnapshot: BuyerSnapshot = client
    ? {
        name: client.name,
        companyId: client.companyId,
        vatNumber: client.vatNumber,
        email: client.email,
        phone: client.phone,
        address: buyerAddress?.street,
        street2: buyerAddress?.street2,
        city: buyerAddress?.city,
        postalCode: buyerAddress?.postalCode,
        country: buyerAddress?.country,
      }
    : normalizeBuyerSnapshot(input.buyerSnapshot);

  const taxableAt = input.taxableAt || input.issuedAt;
  const priceListItemIds = Array.from(
    new Set(
      input.items
        .filter((item) => item.sourceKind === 'price_list' && !!item.sourceId)
        .map((item) => item.sourceId as string),
    ),
  );

  const priceListById = new Map<string, PriceListItemModel>();
  if (priceListItemIds.length > 0) {
    const priceListItems = await database
      .get<PriceListItemModel>(PriceListItemModel.table)
      .query(Q.where('id', Q.oneOf(priceListItemIds)))
      .fetch();
    for (const item of priceListItems) {
      priceListById.set(item.id, item);
    }
  }

  const vatNameSet = new Set<string>();
  const vatCodeIdSet = new Set<string>();
  for (const draftItem of input.items) {
    if (draftItem.sourceKind !== 'price_list' || !draftItem.sourceId) continue;
    const priceListItem = priceListById.get(draftItem.sourceId);
    if (priceListItem?.vatCodeId) {
      vatCodeIdSet.add(priceListItem.vatCodeId);
    }
    const normalized = normalizeVatName(priceListItem?.vatName);
    if (normalized) vatNameSet.add(normalized);
  }

  const vatCodeNameToId = new Map<string, string>();
  const vatRatesByCodeId = new Map<string, VatRateModel[]>();
  if (vatNameSet.size > 0 || vatCodeIdSet.size > 0) {
    const vatCodes = await database.get<VatCodeModel>(VatCodeModel.table).query().fetch();
    for (const code of vatCodes) {
      const normalized = normalizeVatName(code.name);
      if (vatNameSet.has(normalized)) {
        vatCodeNameToId.set(normalized, code.id);
      }
    }

    const vatCodeIds = Array.from(new Set([...vatCodeIdSet, ...vatCodeNameToId.values()]));
    if (vatCodeIds.length > 0) {
      const vatRates = await database
        .get<VatRateModel>(VatRateModel.table)
        .query(Q.where('vat_code_id', Q.oneOf(vatCodeIds)))
        .fetch();
      for (const rate of vatRates) {
        const key = rate.vatCodeId || '';
        if (!key) continue;
        const current = vatRatesByCodeId.get(key) || [];
        current.push(rate);
        vatRatesByCodeId.set(key, current);
      }
    }
  }

  const resolvedItems: DraftInvoiceItemInput[] = input.items.map((draftItem) => {
    if (draftItem.sourceKind !== 'price_list' || !draftItem.sourceId) {
      return draftItem;
    }

    const priceListItem = priceListById.get(draftItem.sourceId);
    const vatName = normalizeVatName(priceListItem?.vatName);
    const vatCodeId =
      priceListItem?.vatCodeId || (vatName ? vatCodeNameToId.get(vatName) : undefined);
    const rates = vatCodeId ? vatRatesByCodeId.get(vatCodeId) || [] : [];
    const rateByTaxableDate = resolveVatRateForDate(rates, taxableAt) ?? undefined;

    return {
      ...draftItem,
      vatCodeId: vatCodeId ?? draftItem.vatCodeId,
      vatRate: rateByTaxableDate ?? draftItem.vatRate,
    };
  });

  const normalizedItems = isVatPayer
    ? resolvedItems
    : resolvedItems.map((item) => ({
        ...item,
        vatCodeId: undefined,
        vatRate: undefined,
      }));

  return {
    buyerSnapshot,
    sellerSnapshot,
    normalizedItems,
    totals: (() => {
      const { subtotal, total } = calculateLineItemTotals(normalizedItems, isVatPayer);
      return { subtotal, total };
    })(),
    normalizedCurrency: normalizeCurrencyCode(
      input.currency,
      settings?.defaultInvoiceCurrency || DEFAULT_CURRENCY_CODE,
    ),
    normalizedPaymentMethod: input.paymentMethod?.trim() || undefined,
    normalizedBuyerReference: input.buyerReference?.trim() || undefined,
    normalizedHeaderNote: input.headerNote?.trim() || undefined,
    normalizedFooterNote: input.footerNote?.trim() || undefined,
  };
}

async function replaceInvoiceItems(
  invoiceId: string,
  items: DraftInvoiceItemInput[],
  invoiceItemCollection = database.get<InvoiceItemModel>(InvoiceItemModel.table),
): Promise<void> {
  const existingItems = await invoiceItemCollection.query(Q.where('invoice_id', invoiceId)).fetch();
  if (existingItems.length > 0) {
    await Promise.all(existingItems.map((item) => item.markAsDeleted()));
  }

  for (const sourceItem of items) {
    await invoiceItemCollection.create((item: InvoiceItemModel) => {
      item.invoiceId = invoiceId;
      item.sourceKind = sourceItem.sourceKind;
      item.sourceId = sourceItem.sourceId;
      item.description = sourceItem.description;
      item.quantity = sourceItem.quantity;
      item.unit = sourceItem.unit;
      item.unitPrice = sourceItem.unitPrice;
      item.totalPrice = sourceItem.totalPrice;
      item.vatCodeId = sourceItem.vatCodeId;
      item.vatRate = sourceItem.vatRate;
    });
  }
}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceModel> {
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const invoiceItemCollection = database.get<InvoiceItemModel>(InvoiceItemModel.table);
  const settings = await getSettings();
  const deviceSettings = await getDeviceSyncSettings(settings);

  return database.write(async () => {
    const resolved = await resolveInvoiceWriteData(input, settings);
    const manualInvoiceNumber = input.invoiceNumber.trim();
    const autoInvoiceNumber = !manualInvoiceNumber
      ? await resolveNextAvailableInvoiceNumber(invoiceCollection, settings, deviceSettings)
      : null;
    const invoiceNumber = manualInvoiceNumber || autoInvoiceNumber?.invoiceNumber || '';
    await assertInvoiceNumberAvailable(invoiceCollection, invoiceNumber);

    const invoice = await invoiceCollection.create((item: InvoiceModel) => {
      item.clientId = input.clientId.trim();
      item.invoiceNumber = invoiceNumber;
      item.buyerReference = resolved.normalizedBuyerReference;
      item.issuedAt = input.issuedAt;
      item.taxableAt = input.taxableAt;
      item.dueAt = input.dueAt;
      item.currency = resolved.normalizedCurrency;
      item.paymentMethod = resolved.normalizedPaymentMethod;
      item.status = 'issued';
      item.headerNote = resolved.normalizedHeaderNote;
      item.footerNote = resolved.normalizedFooterNote;
      item.sellerSnapshotJson = JSON.stringify(resolved.sellerSnapshot);
      item.buyerSnapshotJson = JSON.stringify(resolved.buyerSnapshot);
      item.subtotal = resolved.totals.subtotal;
      item.total = resolved.totals.total;
    });

    await replaceInvoiceItems(invoice.id, resolved.normalizedItems, invoiceItemCollection);

    if (settings) {
      await settings.update((s: AppSettingsModel) => {
        if (autoInvoiceNumber) {
          s.invoiceSeriesNextNumber = autoInvoiceNumber.nextNumberUsed + 1;
          return;
        }

        const current = Math.max(1, Math.floor(s.invoiceSeriesNextNumber || 1));
        s.invoiceSeriesNextNumber = current + 1;
      });
    }

    return invoice;
  });
}

export async function updateIssuedInvoice(input: UpdateIssuedInvoiceInput): Promise<InvoiceModel> {
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const invoiceItemCollection = database.get<InvoiceItemModel>(InvoiceItemModel.table);
  const settings = await getSettings();

  return database.write(async () => {
    const invoice = await invoiceCollection.find(input.id);
    const resolved = await resolveInvoiceWriteData(input, settings);
    const invoiceNumber = input.invoiceNumber.trim();
    await assertInvoiceNumberAvailable(invoiceCollection, invoiceNumber, invoice.id);

    await invoice.update((item: InvoiceModel) => {
      const normalizedClientId = input.clientId.trim();

      item.clientId = normalizedClientId;
      item.invoiceNumber = invoiceNumber;
      item.buyerReference = resolved.normalizedBuyerReference;
      item.issuedAt = input.issuedAt;
      item.taxableAt = input.taxableAt;
      item.dueAt = input.dueAt;
      item.currency = resolved.normalizedCurrency;
      item.paymentMethod = resolved.normalizedPaymentMethod;
      item.status = 'issued';
      item.headerNote = resolved.normalizedHeaderNote;
      item.footerNote = resolved.normalizedFooterNote;
      item.sellerSnapshotJson =
        input.refreshSellerSnapshot || !invoice.sellerSnapshotJson
          ? JSON.stringify(resolved.sellerSnapshot)
          : invoice.sellerSnapshotJson;
      item.buyerSnapshotJson =
        normalizedClientId && invoice.clientId === normalizedClientId && invoice.buyerSnapshotJson
          ? invoice.buyerSnapshotJson
          : JSON.stringify(resolved.buyerSnapshot);
      item.lastExportedAt = undefined;
      item.correctedInvoiceId = invoice.correctedInvoiceId;
      item.correctionKind = invoice.correctionKind;
      item.cancellationReason = invoice.cancellationReason;
      item.subtotal = resolved.totals.subtotal;
      item.total = resolved.totals.total;
    });

    await replaceInvoiceItems(invoice.id, resolved.normalizedItems, invoiceItemCollection);

    return invoice;
  });
}

export async function markInvoiceExported(id: string, exportedAt = Date.now()): Promise<void> {
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);

  await database.write(async () => {
    const invoice = await invoiceCollection.find(id);
    await invoice.update((item: InvoiceModel) => {
      item.lastExportedAt = exportedAt;
    });
  });
}

export async function getInvoiceCancellationLink(invoiceId: string): Promise<InvoiceModel | null> {
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const current = await invoiceCollection.find(invoiceId);

  if (current.correctionKind === 'cancellation' && current.correctedInvoiceId) {
    return invoiceCollection.find(current.correctedInvoiceId);
  }

  const correction = await invoiceCollection
    .query(
      Q.where('corrected_invoice_id', invoiceId),
      Q.where('correction_kind', 'cancellation'),
      Q.take(1),
    )
    .fetch();

  return correction[0] ?? null;
}

export async function cancelInvoice(input: CancelInvoiceInput): Promise<InvoiceModel> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error(INVOICE_CANCELLATION_REASON_REQUIRED_ERROR);
  }

  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const invoiceItemCollection = database.get<InvoiceItemModel>(InvoiceItemModel.table);
  const settings = await getSettings();
  const deviceSettings = await getDeviceSyncSettings(settings);

  return database.write(async () => {
    const invoice = await invoiceCollection.find(input.id);

    if (invoice.status !== 'issued' || invoice.correctionKind === 'cancellation') {
      throw new Error(INVOICE_CANCELLATION_INVALID_STATE_ERROR);
    }

    if (input.mode === 'void_before_delivery') {
      await invoice.update((item: InvoiceModel) => {
        item.status = 'voided_before_delivery';
        item.cancellationReason = reason;
      });

      return invoice;
    }

    const existingCancellation = await invoiceCollection
      .query(
        Q.where('corrected_invoice_id', invoice.id),
        Q.where('correction_kind', 'cancellation'),
        Q.take(1),
      )
      .fetch();

    if (existingCancellation.length > 0) {
      throw new Error(INVOICE_CANCELLATION_ALREADY_EXISTS_ERROR);
    }

    const sourceItems = await invoiceItemCollection
      .query(Q.where('invoice_id', invoice.id), Q.sortBy('created_at', Q.asc))
      .fetch();

    const issuedAt = toLocalDayStart();
    const taxableAt = isInvoiceVatPayer(invoice) ? issuedAt : undefined;
    const dueAt = issuedAt;
    const { invoiceNumber: nextInvoiceNumber, nextNumberUsed } =
      await resolveNextAvailableInvoiceNumber(invoiceCollection, settings, deviceSettings, [
        invoice.invoiceNumber,
      ]);

    const cancellationInvoice = await invoiceCollection.create((item: InvoiceModel) => {
      item.clientId = invoice.clientId;
      item.invoiceNumber = nextInvoiceNumber;
      item.buyerReference = invoice.buyerReference;
      item.issuedAt = issuedAt;
      item.taxableAt = taxableAt;
      item.dueAt = dueAt;
      item.currency = invoice.currency;
      item.paymentMethod = invoice.paymentMethod;
      item.status = 'issued';
      item.headerNote = invoice.headerNote;
      item.footerNote = invoice.footerNote;
      item.sellerSnapshotJson = invoice.sellerSnapshotJson;
      item.buyerSnapshotJson = invoice.buyerSnapshotJson;
      item.correctedInvoiceId = invoice.id;
      item.correctionKind = 'cancellation';
      item.cancellationReason = reason;
      item.subtotal = -Math.abs(invoice.subtotal);
      item.total = -Math.abs(invoice.total);
    });

    await replaceInvoiceItems(
      cancellationInvoice.id,
      sourceItems.map((sourceItem) => ({
        sourceKind: sourceItem.sourceKind as DraftInvoiceItemInput['sourceKind'],
        sourceId: sourceItem.sourceId,
        description: sourceItem.description,
        // Keep the original quantity and invert the pricing fields so the cancellation
        // document remains a full negative mirror of the billed values.
        quantity: sourceItem.quantity,
        unit: sourceItem.unit,
        unitPrice: -Math.abs(sourceItem.unitPrice),
        totalPrice: -Math.abs(sourceItem.totalPrice),
        vatCodeId: sourceItem.vatCodeId,
        vatRate: sourceItem.vatRate,
      })),
      invoiceItemCollection,
    );

    await invoice.update((item: InvoiceModel) => {
      item.status = 'canceled_by_correction';
      item.cancellationReason = reason;
    });

    if (settings) {
      await settings.update((s: AppSettingsModel) => {
        s.invoiceSeriesNextNumber = nextNumberUsed + 1;
      });
    }

    return cancellationInvoice;
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  const invoiceCollection = database.get<InvoiceModel>(InvoiceModel.table);
  const invoiceItemCollection = database.get<InvoiceItemModel>(InvoiceItemModel.table);

  await database.write(async () => {
    const invoice = await invoiceCollection.find(id);

    if (
      invoice.correctionKind === 'cancellation' ||
      (invoice.status !== 'issued' && invoice.status !== 'voided_before_delivery')
    ) {
      throw new Error(INVOICE_DELETE_INVALID_STATE_ERROR);
    }

    const linkedCancellation = await invoiceCollection
      .query(
        Q.where('corrected_invoice_id', invoice.id),
        Q.where('correction_kind', 'cancellation'),
        Q.take(1),
      )
      .fetch();

    if (linkedCancellation.length > 0) {
      throw new Error(INVOICE_DELETE_INVALID_STATE_ERROR);
    }

    const existingItems = await invoiceItemCollection
      .query(Q.where('invoice_id', invoice.id))
      .fetch();
    if (existingItems.length > 0) {
      await Promise.all(existingItems.map((item) => item.markAsDeleted()));
    }

    await invoice.markAsDeleted();
  });
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItemModel[]> {
  return database
    .get<InvoiceItemModel>(InvoiceItemModel.table)
    .query(Q.where('invoice_id', invoiceId), Q.sortBy('created_at', Q.asc))
    .fetch();
}

export async function getInvoiceClient(clientId: string): Promise<ClientModel> {
  return database.get<ClientModel>(ClientModel.table).find(clientId);
}

export type TimesheetInvoiceCandidate = {
  id: string;
  label: string;
  periodFrom: number;
  periodTo: number;
  durationSeconds: number;
  suggestedTotal: number;
};

export async function getTimesheetCandidates(
  clientId: string,
): Promise<TimesheetInvoiceCandidate[]> {
  const allTimesheets = await database
    .get<TimesheetModel>(TimesheetModel.table)
    .query(Q.where('client_id', clientId), Q.sortBy('period_from', Q.desc))
    .fetch();

  if (allTimesheets.length === 0) {
    return [];
  }

  const timesheetIds = allTimesheets.map((sheet) => sheet.id);
  const linkedInvoiceItems = await database
    .get<InvoiceItemModel>(InvoiceItemModel.table)
    .query(Q.where('source_kind', 'timesheet'), Q.where('source_id', Q.oneOf(timesheetIds)))
    .fetch();

  const linkedInvoiceIds = Array.from(
    new Set(linkedInvoiceItems.map((item) => item.invoiceId).filter(Boolean)),
  );
  const invoicesById = new Map<string, InvoiceModel>();
  if (linkedInvoiceIds.length > 0) {
    const linkedInvoices = await database
      .get<InvoiceModel>(InvoiceModel.table)
      .query(Q.where('id', Q.oneOf(linkedInvoiceIds)))
      .fetch();
    for (const invoice of linkedInvoices) {
      invoicesById.set(invoice.id, invoice);
    }
  }

  const linkedTimesheetIds = new Set(
    linkedInvoiceItems
      .filter((item) => invoicesById.get(item.invoiceId)?.status !== 'voided_before_delivery')
      .map((item) => item.sourceId)
      .filter((value): value is string => !!value),
  );
  const timesheets = allTimesheets.filter((sheet) => !linkedTimesheetIds.has(sheet.id));

  if (timesheets.length === 0) {
    return [];
  }

  const timeEntries = await database
    .get<TimeEntryModel>(TimeEntryModel.table)
    .query(Q.where('timesheet_id', Q.notEq(null)))
    .fetch();

  const groupedStats = new Map<string, { duration: number; total: number }>();
  for (const entry of timeEntries) {
    if (!entry.timesheetId) continue;
    const current = groupedStats.get(entry.timesheetId) ?? { duration: 0, total: 0 };
    const durationSeconds = entry.timesheetDuration ?? entry.duration ?? 0;
    const durationHours = durationSeconds / 3600;
    const rate = entry.rate ?? 0;

    current.duration += durationSeconds;
    current.total += durationHours * rate;
    groupedStats.set(entry.timesheetId, current);
  }

  return timesheets.map((sheet) => {
    const stat = groupedStats.get(sheet.id) ?? { duration: 0, total: 0 };
    return {
      id: sheet.id,
      label: [
        sheet.timesheetNumber?.trim(),
        sheet.label?.trim() ||
          `${new Date(sheet.periodFrom).toLocaleDateString()} - ${new Date(sheet.periodTo).toLocaleDateString()}`,
      ]
        .filter(Boolean)
        .join(' • '),
      periodFrom: sheet.periodFrom,
      periodTo: sheet.periodTo,
      durationSeconds: stat.duration,
      suggestedTotal: stat.total,
    };
  });
}

export async function getActivePriceListForInvoicing(): Promise<PriceListItemModel[]> {
  return database
    .get<PriceListItemModel>(PriceListItemModel.table)
    .query(Q.where('is_active', true), Q.sortBy('name', Q.asc))
    .fetch();
}
