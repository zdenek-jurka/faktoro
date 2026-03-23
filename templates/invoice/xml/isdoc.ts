import { escapeXml, isoDateFromMs } from './shared';
import type { InvoiceXmlBuildInput } from './types';

export function buildIsdocXml({ invoice, items, buyer, seller }: InvoiceXmlBuildInput): string {
  const linesXml = items
    .map(
      (item, index) => `
      <InvoiceLine>
        <LineNumber>${index + 1}</LineNumber>
        <Description>${escapeXml(item.description)}</Description>
        <InvoicedQuantity>${escapeXml(item.quantity)}</InvoicedQuantity>
        <UnitPrice>${escapeXml(item.unitPrice.toFixed(2))}</UnitPrice>
        <LineExtensionAmount>${escapeXml(item.totalPrice.toFixed(2))}</LineExtensionAmount>
      </InvoiceLine>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>1</DocumentType>
  <ID>${escapeXml(invoice.invoiceNumber)}</ID>
  <IssueDate>${escapeXml(isoDateFromMs(invoice.issuedAt))}</IssueDate>
  <TaxPointDate>${escapeXml(isoDateFromMs(invoice.taxableAt || invoice.issuedAt))}</TaxPointDate>
  <DueDate>${escapeXml(isoDateFromMs(invoice.dueAt))}</DueDate>
  <LocalCurrencyCode>${escapeXml(invoice.currency)}</LocalCurrencyCode>
  <AccountingSupplierParty>
    <Party>
      <PartyName><Name>${escapeXml(seller.companyName)}</Name></PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(seller.address)}</StreetName>
        <CityName>${escapeXml(seller.city)}</CityName>
        <PostalZone>${escapeXml(seller.postalCode)}</PostalZone>
        <Country><IdentificationCode>${escapeXml(seller.country || 'CZ')}</IdentificationCode></Country>
      </PostalAddress>
      <PartyTaxScheme><CompanyID>${escapeXml(seller.vatNumber)}</CompanyID></PartyTaxScheme>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyName><Name>${escapeXml(buyer.name)}</Name></PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(buyer.address)}</StreetName>
        <CityName>${escapeXml(buyer.city)}</CityName>
        <PostalZone>${escapeXml(buyer.postalCode)}</PostalZone>
        <Country><IdentificationCode>${escapeXml(buyer.country || '')}</IdentificationCode></Country>
      </PostalAddress>
      <PartyTaxScheme><CompanyID>${escapeXml(buyer.vatNumber)}</CompanyID></PartyTaxScheme>
    </Party>
  </AccountingCustomerParty>
  <PaymentMeans>
    <Payment>
      <Details>
        <BankCode>${escapeXml(seller.swift)}</BankCode>
        <IBAN>${escapeXml(seller.iban)}</IBAN>
      </Details>
    </Payment>
  </PaymentMeans>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${escapeXml(invoice.subtotal.toFixed(2))}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${escapeXml(invoice.total.toFixed(2))}</TaxInclusiveAmount>
    <PayableAmount>${escapeXml(invoice.total.toFixed(2))}</PayableAmount>
  </LegalMonetaryTotal>
  <InvoiceLines>${linesXml}
  </InvoiceLines>
</Invoice>`;
}
