export type InvoicePdfTemplateLabels = {
  title: string;
  taxDocumentTitle: string;
  invoiceNumber: string;
  buyerReference: string;
  issueDate: string;
  taxableSupplyDate: string;
  dueDate: string;
  client: string;
  supplier: string;
  buyer: string;
  companyId: string;
  vatNumber: string;
  vat: string;
  vatPercent: string;
  taxBase: string;
  reference: string;
  account: string;
  iban: string;
  swift: string;
  itemDescription: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
  withoutVat: string;
  vatAmount: string;
  withVat: string;
  lineTotal: string;
  total: string;
};

export type InvoicePdfTemplateItem = {
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  totalPrice: number;
  vatRate?: number;
};

export type InvoicePdfTemplateParty = {
  name?: string;
  address?: string;
  street2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  companyId?: string;
  vatNumber?: string;
  registrationNote?: string;
  email?: string;
  phone?: string;
};

export type BuildDefaultInvoicePdfHtmlInput = {
  locale: string;
  currency: string;
  includeVat: boolean;
  watermarkText?: string;
  invoiceNumber: string;
  buyerReference?: string;
  issueAt?: number;
  taxableAt?: number;
  dueAt?: number;
  subtotal: number;
  total: number;
  footerNote?: string;
  variableSymbol?: string;
  bankAccount?: string;
  iban?: string;
  swift?: string;
  logoHtml: string;
  paymentQrHtml: string;
  labels: InvoicePdfTemplateLabels;
  items: InvoicePdfTemplateItem[];
  seller: InvoicePdfTemplateParty;
  buyer: InvoicePdfTemplateParty;
};
