export type InvoicePdfTemplateLabels = {
  title: string;
  invoiceNumber: string;
  issueDate: string;
  taxableSupplyDate: string;
  dueDate: string;
  client: string;
  supplier: string;
  buyer: string;
  vat: string;
  vatPercent: string;
  taxBase: string;
  reference: string;
  account: string;
  iban: string;
  swift: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  total: string;
};

export type InvoicePdfTemplateItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatRate?: number;
};

export type InvoicePdfTemplateParty = {
  name?: string;
  addressLine?: string;
  companyId?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
};

export type BuildDefaultInvoicePdfHtmlInput = {
  locale: string;
  currency: string;
  invoiceNumber: string;
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
