import type { InvoiceXmlBuildInput, SellerSnapshot } from './types';
import { escapeXml, isoDateFromMs } from './shared';

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function buildSellerAddress(seller: SellerSnapshot): string {
  return [seller.address, seller.street2, seller.city, seller.postalCode, seller.country]
    .filter(Boolean)
    .join(', ');
}

function buildBuyerAddress(input: InvoiceXmlBuildInput['buyer']): string {
  return [input.address, input.street2, input.city, input.postalCode, input.country]
    .filter(Boolean)
    .join(', ');
}

export function buildBaseInvoiceXml(input: InvoiceXmlBuildInput): string {
  const { invoice, items, client, seller, buyer } = input;
  const sellerAddress = buildSellerAddress(seller);
  const buyerAddress = buildBuyerAddress(buyer);
  const taxableSupplyDateXml = invoice.taxableAt
    ? `  <TaxableSupplyDate>${escapeXml(isoDateFromMs(invoice.taxableAt))}</TaxableSupplyDate>\n`
    : '';
  const sellerVatNumberXml = seller.vatNumber
    ? `    <VatNumber>${escapeXml(seller.vatNumber)}</VatNumber>\n`
    : '';
  const sellerRegistrationNoteXml = seller.registrationNote
    ? `    <RegistrationNote>${escapeXml(seller.registrationNote)}</RegistrationNote>\n`
    : '';
  const buyerVatNumberXml = buyer.vatNumber
    ? `    <VatNumber>${escapeXml(buyer.vatNumber)}</VatNumber>\n`
    : '';

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
${taxableSupplyDateXml}  <DueDate>${escapeXml(isoDateFromMs(invoice.dueAt))}</DueDate>
  <Currency>${escapeXml(invoice.currency)}</Currency>
  <PaymentMethod>${escapeXml(invoice.paymentMethod)}</PaymentMethod>
  <Status>${escapeXml(invoice.status)}</Status>
  <HeaderNote>${escapeXml(invoice.headerNote)}</HeaderNote>
  <FooterNote>${escapeXml(invoice.footerNote)}</FooterNote>
  <Seller>
    <Name>${escapeXml(seller.companyName)}</Name>
    <CompanyId>${escapeXml(seller.companyId)}</CompanyId>
${sellerVatNumberXml}    <Address>${escapeXml(sellerAddress)}</Address>
${sellerRegistrationNoteXml}    <Email>${escapeXml(seller.email)}</Email>
    <Phone>${escapeXml(seller.phone)}</Phone>
    <Website>${escapeXml(seller.website)}</Website>
    <BankAccount>${escapeXml(seller.bankAccount)}</BankAccount>
    <Iban>${escapeXml(seller.iban)}</Iban>
    <Swift>${escapeXml(seller.swift)}</Swift>
  </Seller>
  <Buyer>
    <Id>${escapeXml(client?.id)}</Id>
    <Name>${escapeXml(buyer.name)}</Name>
    <CompanyId>${escapeXml(buyer.companyId)}</CompanyId>
${buyerVatNumberXml}    <Address>${escapeXml(buyerAddress)}</Address>
    <Email>${escapeXml(buyer.email)}</Email>
    <Phone>${escapeXml(buyer.phone)}</Phone>
  </Buyer>
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
