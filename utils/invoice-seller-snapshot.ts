import type { AppSettingsModel, ClientModel } from '@/model';
import type { SellerSnapshot } from '@/templates/invoice/xml';

export type SellerSnapshotSettingsSource = Pick<
  AppSettingsModel,
  | 'isVatPayer'
  | 'invoiceCompanyName'
  | 'invoiceAddress'
  | 'invoiceStreet2'
  | 'invoiceCity'
  | 'invoicePostalCode'
  | 'invoiceCountry'
  | 'invoiceCompanyId'
  | 'invoiceVatNumber'
  | 'invoiceRegistrationNote'
  | 'invoiceEmail'
  | 'invoicePhone'
  | 'invoiceWebsite'
  | 'invoiceBankAccount'
  | 'invoiceIban'
  | 'invoiceSwift'
  | 'invoiceLogoUri'
  | 'invoiceQrType'
>;

type SellerSnapshotClientSource = Pick<ClientModel, 'invoiceQrType'>;

const SELLER_SNAPSHOT_TEXT_FIELDS = [
  'companyName',
  'address',
  'street2',
  'city',
  'postalCode',
  'country',
  'companyId',
  'vatNumber',
  'registrationNote',
  'email',
  'phone',
  'website',
  'bankAccount',
  'iban',
  'swift',
  'logoUri',
] as const satisfies readonly (keyof SellerSnapshot)[];

function normalizeOptionalText(value?: string | null): string {
  return value?.trim() || '';
}

export function buildSellerSnapshotFromSettings(
  settings?: SellerSnapshotSettingsSource | null,
  client?: SellerSnapshotClientSource | null,
): SellerSnapshot {
  const effectiveQrType = client?.invoiceQrType || settings?.invoiceQrType || 'none';
  const isVatPayer = !!settings?.isVatPayer;

  return {
    companyName: settings?.invoiceCompanyName,
    address: settings?.invoiceAddress,
    street2: settings?.invoiceStreet2,
    city: settings?.invoiceCity,
    postalCode: settings?.invoicePostalCode,
    country: settings?.invoiceCountry,
    companyId: settings?.invoiceCompanyId,
    vatNumber: isVatPayer ? settings?.invoiceVatNumber : undefined,
    registrationNote: settings?.invoiceRegistrationNote,
    email: settings?.invoiceEmail,
    phone: settings?.invoicePhone,
    website: settings?.invoiceWebsite,
    bankAccount: settings?.invoiceBankAccount,
    iban: settings?.invoiceIban,
    swift: settings?.invoiceSwift,
    logoUri: settings?.invoiceLogoUri,
    qrType: effectiveQrType,
  };
}

export function parseSellerSnapshotJson(value?: string | null): SellerSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SellerSnapshot;
  } catch {
    return null;
  }
}

export function areSellerSnapshotsEqual(
  storedSnapshot?: SellerSnapshot | null,
  currentSnapshot?: SellerSnapshot | null,
): boolean {
  if (!storedSnapshot || !currentSnapshot) return false;

  for (const field of SELLER_SNAPSHOT_TEXT_FIELDS) {
    if (
      normalizeOptionalText(storedSnapshot[field]) !== normalizeOptionalText(currentSnapshot[field])
    ) {
      return false;
    }
  }

  return (
    normalizeOptionalText(storedSnapshot.qrType || 'none') ===
    normalizeOptionalText(currentSnapshot.qrType || 'none')
  );
}
