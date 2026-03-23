import { AddressType } from '@/db/schema';

export interface AddressFormData {
  type: AddressType;
  street: string;
  street2: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface ClientFormData {
  name: string;
  exportLanguage: string;
  invoiceQrType: string;
  invoiceDefaultExportFormat: string;
  invoicePaymentMethod: string;
  invoiceDueDays: string;
  vatNumber: string;
  companyId: string;
  isCompany: boolean;
  isVatPayer: boolean;
  email: string;
  phone: string;
  notes: string;
  billingIntervalEnabled: boolean;
  billingIntervalMinutes: string;
  timerLimitMode: string;
  timerSoftLimitHours: string;
  timerHardLimitHours: string;
}
