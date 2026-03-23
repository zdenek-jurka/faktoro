import type { ClientModel, InvoiceItemModel, InvoiceModel } from '@/model';

export type InvoiceXmlFormat = 'isdoc' | 'peppol' | 'xrechnung';

export type SellerSnapshot = {
  companyName?: string;
  address?: string;
  street2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  companyId?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  bankAccount?: string;
  iban?: string;
  swift?: string;
  logoUri?: string;
  qrType?: string;
};

export type BuyerSnapshot = {
  name?: string;
  companyId?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  street2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
};

export type InvoiceXmlBuildInput = {
  invoice: InvoiceModel;
  items: InvoiceItemModel[];
  client: ClientModel | null;
  seller: SellerSnapshot;
  buyer: BuyerSnapshot;
};
