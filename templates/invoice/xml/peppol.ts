import { buildUblInvoiceXml } from './ubl';
import type { InvoiceXmlBuildInput } from './types';

export function buildPeppolXml(input: InvoiceXmlBuildInput): string {
  return buildUblInvoiceXml('peppol', input);
}
