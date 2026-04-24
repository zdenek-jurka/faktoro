import type { BuyerSnapshot } from '@/templates/invoice/xml';

export type InvoiceDraftBuyerMode = 'client' | 'one_off';

export type InvoiceBuyerDraft = {
  name: string;
  companyId: string;
  vatNumber: string;
  email: string;
  phone: string;
  address: string;
  street2: string;
  city: string;
  postalCode: string;
  country: string;
};

function normalizeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function toInvoiceBuyerDraft(snapshot?: BuyerSnapshot | null): InvoiceBuyerDraft {
  return {
    name: snapshot?.name || '',
    companyId: snapshot?.companyId || '',
    vatNumber: snapshot?.vatNumber || '',
    email: snapshot?.email || '',
    phone: snapshot?.phone || '',
    address: snapshot?.address || '',
    street2: snapshot?.street2 || '',
    city: snapshot?.city || '',
    postalCode: snapshot?.postalCode || '',
    country: snapshot?.country || '',
  };
}

export function normalizeBuyerSnapshot(snapshot?: BuyerSnapshot | null): BuyerSnapshot {
  return {
    name: normalizeValue(snapshot?.name),
    companyId: normalizeValue(snapshot?.companyId),
    vatNumber: normalizeValue(snapshot?.vatNumber),
    email: normalizeValue(snapshot?.email),
    phone: normalizeValue(snapshot?.phone),
    address: normalizeValue(snapshot?.address),
    street2: normalizeValue(snapshot?.street2),
    city: normalizeValue(snapshot?.city),
    postalCode: normalizeValue(snapshot?.postalCode),
    country: normalizeValue(snapshot?.country),
  };
}

export function toInvoiceBuyerSnapshot(draft: InvoiceBuyerDraft): BuyerSnapshot {
  return normalizeBuyerSnapshot(draft);
}

export function parseBuyerSnapshotJson(value?: string | null): BuyerSnapshot | null {
  if (!value) return null;
  try {
    return normalizeBuyerSnapshot(JSON.parse(value) as BuyerSnapshot);
  } catch {
    return null;
  }
}

export function getBuyerDisplayName(snapshot?: BuyerSnapshot | null): string {
  return snapshot?.name?.trim() || '';
}
