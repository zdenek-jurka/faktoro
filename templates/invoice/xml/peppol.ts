import { escapeXml, isoDateFromMs } from './shared';
import type { InvoiceXmlBuildInput } from './types';

export function buildPeppolXml({ invoice, items, buyer, seller }: InvoiceXmlBuildInput): string {
  const linesXml = items
    .map(
      (item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity>${escapeXml(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(item.totalPrice.toFixed(2))}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${escapeXml(item.description)}</cbc:Name></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(item.unitPrice.toFixed(2))}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(isoDateFromMs(invoice.issuedAt))}</cbc:IssueDate>
  <cbc:DueDate>${escapeXml(isoDateFromMs(invoice.dueAt))}</cbc:DueDate>
  <cbc:DocumentCurrencyCode>${escapeXml(invoice.currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(seller.companyName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(seller.address)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(seller.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(seller.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${escapeXml(seller.country || 'CZ')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(seller.vatNumber)}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(buyer.address)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(buyer.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(buyer.postalCode)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${escapeXml(buyer.country || '')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(buyer.vatNumber)}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(invoice.subtotal.toFixed(2))}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(invoice.subtotal.toFixed(2))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(invoice.total.toFixed(2))}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(invoice.currency)}">${escapeXml(invoice.total.toFixed(2))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>`;
}
