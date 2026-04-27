import { buildUblInvoiceXml } from './ubl';
import type { InvoiceXmlBuildInput } from './types';

export function buildXrechnungXml(input: InvoiceXmlBuildInput): string {
  return buildUblInvoiceXml('xrechnung', input);
}
