import { buildBaseInvoiceXml } from './base';
import { buildIsdocXml } from './isdoc';
import { buildPeppolXml } from './peppol';
import type { InvoiceXmlBuildInput, InvoiceXmlFormat } from './types';
import { buildXrechnungXml } from './xrechnung';

export type {
  BuyerSnapshot,
  InvoiceXmlBuildInput,
  InvoiceXmlFormat,
  SellerSnapshot,
} from './types';
export { buildBaseInvoiceXml };

export function buildInvoiceXml(format: InvoiceXmlFormat, input: InvoiceXmlBuildInput): string {
  if (format === 'isdoc') return buildIsdocXml(input);
  if (format === 'peppol') return buildPeppolXml(input);
  return buildXrechnungXml(input);
}

export function getInvoiceXmlFileSuffix(format: InvoiceXmlFormat): string {
  if (format === 'isdoc') return 'isdoc';
  if (format === 'peppol') return 'peppol-bis3';
  return 'xrechnung';
}
