import database from '@/db';
import ClientModel from '@/model/ClientModel';
import InvoiceModel from '@/model/InvoiceModel';
import TimeEntryModel from '@/model/TimeEntryModel';
import TimesheetModel from '@/model/TimesheetModel';
import { sanitizeInvoiceDueDays } from '@/utils/invoice-defaults';
import {
  normalizeTimerLimitMode,
  sanitizeTimerLimitMinutes,
  type TimerLimitMode,
} from '@/utils/timer-limit-utils';
import { sanitizeBillingIntervalMinutes } from '@/utils/time-utils';
import { Q } from '@nozbe/watermelondb';

export type CreateClientInput = {
  name: string;
  isCompany: boolean;
  isVatPayer?: boolean;
  exportLanguage?: string | null;
  invoiceQrType?: string | null;
  invoiceDefaultExportFormat?: string | null;
  invoicePaymentMethod?: string | null;
  invoiceDueDays?: number | null;
  vatNumber?: string | null;
  companyId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  billingIntervalEnabled?: boolean;
  billingIntervalMinutes?: number | null;
  timerLimitMode?: TimerLimitMode | null;
  timerSoftLimitMinutes?: number | null;
  timerHardLimitMinutes?: number | null;
};

export type PotentialDuplicateClient = {
  id: string;
  name: string;
  reasons: ('name' | 'companyId' | 'vatNumber' | 'email')[];
};

function normalizeDuplicateText(value?: string | null): string {
  return (value || '').trim().toLocaleLowerCase();
}

function normalizeDuplicateIdentifier(value?: string | null): string {
  return (value || '').replace(/\s+/g, '').toLocaleUpperCase();
}

export async function createClient(input: CreateClientInput): Promise<string> {
  const clients = database.get<ClientModel>(ClientModel.table);
  let createdClientId = '';

  await database.write(async () => {
    await clients.create((c: ClientModel) => {
      c.name = input.name;
      c.isCompany = input.isCompany;
      c.isVatPayer = input.isVatPayer ?? false;
      c.exportLanguage = input.exportLanguage || undefined;
      c.invoiceQrType = input.invoiceQrType || undefined;
      c.invoiceDefaultExportFormat = input.invoiceDefaultExportFormat || undefined;
      c.invoicePaymentMethod = input.invoicePaymentMethod || undefined;
      c.invoiceDueDays = sanitizeInvoiceDueDays(input.invoiceDueDays);
      c.isArchived = false;
      c.companyId = input.companyId || undefined;
      c.vatNumber = input.vatNumber || undefined;
      c.email = input.email || undefined;
      c.phone = input.phone || undefined;
      c.notes = input.notes || undefined;
      c.billingIntervalEnabled = input.billingIntervalEnabled ?? false;
      c.billingIntervalMinutes = sanitizeBillingIntervalMinutes(input.billingIntervalMinutes);
      c.timerLimitMode = normalizeTimerLimitMode(input.timerLimitMode);
      c.timerSoftLimitMinutes =
        normalizeTimerLimitMode(input.timerLimitMode) === 'custom'
          ? sanitizeTimerLimitMinutes(input.timerSoftLimitMinutes)
          : undefined;
      c.timerHardLimitMinutes =
        normalizeTimerLimitMode(input.timerLimitMode) === 'custom'
          ? sanitizeTimerLimitMinutes(input.timerHardLimitMinutes)
          : undefined;
      createdClientId = c.id;
    });
  });

  return createdClientId;
}

export async function findPotentialDuplicateClients(
  input: Pick<CreateClientInput, 'name' | 'companyId' | 'vatNumber' | 'email'>,
  options?: { excludeClientId?: string },
): Promise<PotentialDuplicateClient[]> {
  const clients = database.get<ClientModel>(ClientModel.table);
  const allClients = await clients.query(Q.where('is_archived', false)).fetch();

  const targetName = normalizeDuplicateText(input.name);
  const targetCompanyId = normalizeDuplicateIdentifier(input.companyId);
  const targetVatNumber = normalizeDuplicateIdentifier(input.vatNumber);
  const targetEmail = normalizeDuplicateText(input.email);

  return allClients
    .filter((client) => client.id !== options?.excludeClientId)
    .map((client) => {
      const reasons: PotentialDuplicateClient['reasons'] = [];

      if (targetName && normalizeDuplicateText(client.name) === targetName) {
        reasons.push('name');
      }
      if (targetCompanyId && normalizeDuplicateIdentifier(client.companyId) === targetCompanyId) {
        reasons.push('companyId');
      }
      if (targetVatNumber && normalizeDuplicateIdentifier(client.vatNumber) === targetVatNumber) {
        reasons.push('vatNumber');
      }
      if (targetEmail && normalizeDuplicateText(client.email) === targetEmail) {
        reasons.push('email');
      }

      return {
        id: client.id,
        name: client.name,
        reasons,
      };
    })
    .filter((client) => client.reasons.length > 0);
}

export type UpdateClientInput = {
  id: string;
  name: string;
  isCompany: boolean;
  isVatPayer?: boolean;
  exportLanguage?: string | null;
  invoiceQrType?: string | null;
  invoiceDefaultExportFormat?: string | null;
  invoicePaymentMethod?: string | null;
  invoiceDueDays?: number | null;
  vatNumber?: string | null;
  companyId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  billingIntervalEnabled?: boolean;
  billingIntervalMinutes?: number | null;
  timerLimitMode?: TimerLimitMode | null;
  timerSoftLimitMinutes?: number | null;
  timerHardLimitMinutes?: number | null;
};

export async function updateClient(input: UpdateClientInput): Promise<void> {
  const clients = database.get<ClientModel>(ClientModel.table);

  await database.write(async () => {
    const client = await clients.find(input.id);
    await client.update((c: ClientModel) => {
      c.name = input.name;
      c.isCompany = input.isCompany;
      c.isVatPayer = input.isVatPayer ?? false;
      c.exportLanguage = input.exportLanguage || undefined;
      c.invoiceQrType = input.invoiceQrType || undefined;
      c.invoiceDefaultExportFormat = input.invoiceDefaultExportFormat || undefined;
      c.invoicePaymentMethod = input.invoicePaymentMethod || undefined;
      c.invoiceDueDays = sanitizeInvoiceDueDays(input.invoiceDueDays);
      c.companyId = input.companyId || undefined;
      c.vatNumber = input.vatNumber || undefined;
      c.email = input.email || undefined;
      c.phone = input.phone || undefined;
      c.notes = input.notes || undefined;
      c.billingIntervalEnabled = input.billingIntervalEnabled ?? false;
      c.billingIntervalMinutes = sanitizeBillingIntervalMinutes(input.billingIntervalMinutes);
      c.timerLimitMode = normalizeTimerLimitMode(input.timerLimitMode);
      c.timerSoftLimitMinutes =
        normalizeTimerLimitMode(input.timerLimitMode) === 'custom'
          ? sanitizeTimerLimitMinutes(input.timerSoftLimitMinutes)
          : undefined;
      c.timerHardLimitMinutes =
        normalizeTimerLimitMode(input.timerLimitMode) === 'custom'
          ? sanitizeTimerLimitMinutes(input.timerHardLimitMinutes)
          : undefined;
    });
  });
}

export type ClientDependencyCounts = {
  timeEntries: number;
  invoices: number;
  timesheets: number;
};

export type DeleteClientResult =
  | { status: 'deleted' }
  | { status: 'archived'; dependencyCounts: ClientDependencyCounts };

async function getClientDependencyCounts(clientId: string): Promise<ClientDependencyCounts> {
  const [timeEntries, invoices, timesheets] = await Promise.all([
    database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('client_id', clientId))
      .fetchCount(),
    database
      .get<InvoiceModel>(InvoiceModel.table)
      .query(Q.where('client_id', clientId))
      .fetchCount(),
    database
      .get<TimesheetModel>(TimesheetModel.table)
      .query(Q.where('client_id', clientId))
      .fetchCount(),
  ]);

  return { timeEntries, invoices, timesheets };
}

export async function deleteClient(id: string): Promise<DeleteClientResult> {
  const clients = database.get<ClientModel>(ClientModel.table);
  const dependencyCounts = await getClientDependencyCounts(id);
  const hasDependencies =
    dependencyCounts.timeEntries > 0 ||
    dependencyCounts.invoices > 0 ||
    dependencyCounts.timesheets > 0;

  if (hasDependencies) {
    await database.write(async () => {
      const client = await clients.find(id);
      await client.update((c: ClientModel) => {
        c.isArchived = true;
      });
    });

    return { status: 'archived', dependencyCounts };
  }

  await database.write(async () => {
    const client = await clients.find(id);
    await client.markAsDeleted();
  });

  return { status: 'deleted' };
}

export function getClients(includeAll: boolean = false) {
  const clients = database.get<ClientModel>(ClientModel.table);
  if (includeAll) {
    return clients.query(Q.sortBy('name', Q.asc));
  }

  return clients.query(Q.where('is_archived', false), Q.sortBy('name', Q.asc));
}
