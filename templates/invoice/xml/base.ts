import type { InvoiceXmlBuildInput } from './types';
import { escapeXml, isoDateFromMs } from './shared';

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function buildOptionalElement(
  indent: string,
  name: string,
  value?: string | number | null,
): string {
  const normalized = value == null ? '' : String(value).trim();
  if (!normalized) return '';
  return `${indent}<${name}>${escapeXml(normalized)}</${name}>\n`;
}

function resolveInvoiceDocumentType(input: InvoiceXmlBuildInput): string {
  const includeVat =
    !!input.invoice.taxableAt ||
    input.items.some((item) => item.vatRate != null && Number(item.vatRate) >= 0);

  if (input.invoice.correctionKind === 'cancellation') {
    return includeVat ? 'corrective_tax_document' : 'cancellation_document';
  }

  return includeVat ? 'tax_document' : 'invoice';
}

export function buildBaseInvoiceXml(input: InvoiceXmlBuildInput): string {
  const { invoice, items, client, seller, buyer } = input;
  const documentType = resolveInvoiceDocumentType(input);
  const taxableSupplyDateXml = buildOptionalElement(
    '  ',
    'TaxableSupplyDate',
    isoDateFromMs(invoice.taxableAt),
  );
  const dueDateXml = buildOptionalElement('  ', 'DueDate', isoDateFromMs(invoice.dueAt));
  const paymentMethodXml = buildOptionalElement('  ', 'PaymentMethod', invoice.paymentMethod);
  const correctedInvoiceIdXml = buildOptionalElement(
    '  ',
    'CorrectedInvoiceId',
    invoice.correctedInvoiceId,
  );
  const correctionKindXml = buildOptionalElement('  ', 'CorrectionKind', invoice.correctionKind);
  const cancellationReasonXml = buildOptionalElement(
    '  ',
    'CancellationReason',
    invoice.cancellationReason,
  );
  const headerNoteXml = buildOptionalElement('  ', 'HeaderNote', invoice.headerNote);
  const footerNoteXml = buildOptionalElement('  ', 'FooterNote', invoice.footerNote);
  const sellerVatNumberXml = buildOptionalElement('    ', 'VatNumber', seller.vatNumber);
  const sellerAddressXml = buildOptionalElement('    ', 'Address', seller.address);
  const sellerStreet2Xml = buildOptionalElement('    ', 'Street2', seller.street2);
  const sellerCityXml = buildOptionalElement('    ', 'City', seller.city);
  const sellerPostalCodeXml = buildOptionalElement('    ', 'PostalCode', seller.postalCode);
  const sellerCountryXml = buildOptionalElement('    ', 'Country', seller.country);
  const sellerRegistrationNoteXml = buildOptionalElement(
    '    ',
    'RegistrationNote',
    seller.registrationNote,
  );
  const sellerEmailXml = buildOptionalElement('    ', 'Email', seller.email);
  const sellerPhoneXml = buildOptionalElement('    ', 'Phone', seller.phone);
  const sellerWebsiteXml = buildOptionalElement('    ', 'Website', seller.website);
  const sellerBankAccountXml = buildOptionalElement('    ', 'BankAccount', seller.bankAccount);
  const sellerIbanXml = buildOptionalElement('    ', 'Iban', seller.iban);
  const sellerSwiftXml = buildOptionalElement('    ', 'Swift', seller.swift);
  const buyerVatNumberXml = buildOptionalElement('    ', 'VatNumber', buyer.vatNumber);
  const buyerAddressXml = buildOptionalElement('    ', 'Address', buyer.address);
  const buyerStreet2Xml = buildOptionalElement('    ', 'Street2', buyer.street2);
  const buyerCityXml = buildOptionalElement('    ', 'City', buyer.city);
  const buyerPostalCodeXml = buildOptionalElement('    ', 'PostalCode', buyer.postalCode);
  const buyerCountryXml = buildOptionalElement('    ', 'Country', buyer.country);
  const buyerEmailXml = buildOptionalElement('    ', 'Email', buyer.email);
  const buyerPhoneXml = buildOptionalElement('    ', 'Phone', buyer.phone);

  const itemsXml = items
    .map(
      (item) => `    <Item>
      <Id>${escapeXml(item.id)}</Id>
      <SourceKind>${escapeXml(item.sourceKind)}</SourceKind>
      <SourceId>${escapeXml(item.sourceId)}</SourceId>
      <Description>${escapeXml(item.description)}</Description>
      <Quantity>${escapeXml(formatDecimal(item.quantity, 4))}</Quantity>
      <Unit>${escapeXml(item.unit)}</Unit>
      <UnitPrice>${escapeXml(formatDecimal(item.unitPrice))}</UnitPrice>
      <TotalPrice>${escapeXml(formatDecimal(item.totalPrice))}</TotalPrice>
      <VatCodeId>${escapeXml(item.vatCodeId)}</VatCodeId>
      <VatRate>${escapeXml(item.vatRate != null ? formatDecimal(item.vatRate, 2) : '')}</VatRate>
    </Item>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="https://faktoro.app/xml/invoice/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://faktoro.app/xml/invoice/1.0 invoice.xsd">
  <Id>${escapeXml(invoice.id)}</Id>
  <Number>${escapeXml(invoice.invoiceNumber)}</Number>
  <ClientId>${escapeXml(invoice.clientId)}</ClientId>
  <IssueDate>${escapeXml(isoDateFromMs(invoice.issuedAt))}</IssueDate>
${taxableSupplyDateXml}${dueDateXml}  <Currency>${escapeXml(invoice.currency)}</Currency>
${paymentMethodXml}  <Status>${escapeXml(invoice.status)}</Status>
  <DocumentType>${escapeXml(documentType)}</DocumentType>
${correctedInvoiceIdXml}${correctionKindXml}${cancellationReasonXml}${headerNoteXml}${footerNoteXml}  <Seller>
    <Name>${escapeXml(seller.companyName)}</Name>
    <CompanyId>${escapeXml(seller.companyId)}</CompanyId>
${sellerVatNumberXml}${sellerAddressXml}${sellerStreet2Xml}${sellerCityXml}${sellerPostalCodeXml}${sellerCountryXml}${sellerRegistrationNoteXml}${sellerEmailXml}${sellerPhoneXml}${sellerWebsiteXml}${sellerBankAccountXml}${sellerIbanXml}${sellerSwiftXml}  </Seller>
  <Buyer>
    <Id>${escapeXml(client?.id)}</Id>
    <Name>${escapeXml(buyer.name)}</Name>
    <CompanyId>${escapeXml(buyer.companyId)}</CompanyId>
${buyerVatNumberXml}${buyerAddressXml}${buyerStreet2Xml}${buyerCityXml}${buyerPostalCodeXml}${buyerCountryXml}${buyerEmailXml}${buyerPhoneXml}  </Buyer>
  <Summary>
    <Subtotal>${escapeXml(formatDecimal(invoice.subtotal))}</Subtotal>
    <Total>${escapeXml(formatDecimal(invoice.total))}</Total>
  </Summary>
  <Items>
${itemsXml}
  </Items>
</Invoice>
`;
}
