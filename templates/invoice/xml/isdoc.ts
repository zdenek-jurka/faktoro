import { escapeXml, isoDateFromMs } from './shared';
import type { BuyerSnapshot, InvoiceXmlBuildInput, SellerSnapshot } from './types';
import { splitStreetAndBuildingNumber } from '@/utils/address-building-number';

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmount(value: number): string {
  return roundCurrency(value).toFixed(2);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function normalizeCurrency(value?: string): string {
  return (value || 'CZK').trim().toUpperCase() || 'CZK';
}

function compactDigits(value?: string): string {
  return (value || '').replace(/\D+/g, '');
}

function compactText(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  AT: 'Austria',
  BE: 'Belgium',
  BG: 'Bulgaria',
  CH: 'Switzerland',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DK: 'Denmark',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IT: 'Italy',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
  US: 'United States',
};

function deterministicUuid(seed: string): string {
  const bytes = Array.from(seed || 'faktoro-isdoc');
  let hex = '';

  for (let index = 0; hex.length < 32; index += 1) {
    const char = bytes[index % bytes.length] || '0';
    const code = char.charCodeAt(0);
    const mixed = (code + index * 17) % 256;
    hex += mixed.toString(16).padStart(2, '0');
  }

  const normalized = `${hex.slice(0, 8)}${hex.slice(8, 12)}4${hex.slice(13, 16)}8${hex.slice(
    17,
    20,
  )}${hex.slice(20, 32)}`;

  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(
    12,
    16,
  )}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function resolvePartyId(seed: string, companyId?: string, vatNumber?: string): string {
  const companyDigits = compactDigits(companyId);
  if (companyDigits) return companyDigits;

  const vatDigits = compactDigits(vatNumber);
  if (vatDigits) return vatDigits;

  return compactText(seed).slice(0, 36) || deterministicUuid(seed);
}

function resolveCountryCode(country?: string): string {
  const trimmed = (country || '').trim().toUpperCase();
  if (trimmed.length === 2) return trimmed;
  return 'CZ';
}

function resolveCountryName(country?: string): string {
  const trimmed = compactText(country);
  const countryCode = resolveCountryCode(country);
  if (trimmed && trimmed.length > 2) return trimmed;
  return COUNTRY_NAME_BY_CODE[countryCode] || countryCode;
}

function buildPartyXml(
  party: BuyerSnapshot | SellerSnapshot,
  fallbackIdSeed: string,
  fallbackName: string,
): string {
  const partyId = resolvePartyId(fallbackIdSeed, party.companyId, party.vatNumber);
  const partyName = compactText(
    'name' in party ? party.name : (party as SellerSnapshot).companyName || fallbackName,
  );
  const { streetName, buildingNumber } = splitStreetAndBuildingNumber(party.address);
  const city = compactText(party.city);
  const postalCode = compactText(party.postalCode);
  const country = resolveCountryCode(party.country);
  const countryName = resolveCountryName(party.country);
  const hasVatNumber = compactText(party.vatNumber).length > 0;

  return `<Party>
      <PartyIdentification>
        <ID>${escapeXml(partyId)}</ID>
      </PartyIdentification>
      <PartyName><Name>${escapeXml(partyName || fallbackName)}</Name></PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(streetName)}</StreetName>
        <BuildingNumber>${escapeXml(buildingNumber)}</BuildingNumber>
        <CityName>${escapeXml(city)}</CityName>
        <PostalZone>${escapeXml(postalCode)}</PostalZone>
        <Country><IdentificationCode>${escapeXml(country)}</IdentificationCode><Name>${escapeXml(countryName)}</Name></Country>
      </PostalAddress>
      ${
        hasVatNumber
          ? `<PartyTaxScheme><CompanyID>${escapeXml(compactText(party.vatNumber))}</CompanyID><TaxScheme>VAT</TaxScheme></PartyTaxScheme>`
          : ''
      }
    </Party>`;
}

function getPaymentMeansCode(paymentMethod?: string): string {
  if (paymentMethod === 'cash') return '10';
  if (paymentMethod === 'card' || paymentMethod === 'card_nfc') return '48';
  return '42';
}

export function buildIsdocXml({ invoice, items, buyer, seller }: InvoiceXmlBuildInput): string {
  const localCurrencyCode = normalizeCurrency(invoice.currency);
  const invoiceUuid = deterministicUuid(invoice.id || invoice.invoiceNumber);
  const invoiceNote = compactText(invoice.footerNote || invoice.headerNote);
  const buyerReference = compactText(invoice.buyerReference);
  const vatApplicable = items.some((item) => Number(item.vatRate ?? 0) > 0) || !!seller.vatNumber;
  const anonymousCustomerParty = compactDigits(buyer.companyId).length === 0;

  const taxGroups = new Map<
    string,
    {
      rate: number;
      taxableAmount: number;
      taxAmount: number;
      taxInclusiveAmount: number;
      vatApplicable: boolean;
    }
  >();

  const linesXml = items
    .map((item, index) => {
      const rate = Number(item.vatRate ?? 0);
      const lineTaxAmount = roundCurrency(item.totalPrice * (rate / 100));
      const lineTaxInclusiveAmount = roundCurrency(item.totalPrice + lineTaxAmount);
      const unitPriceTaxInclusive = roundCurrency(item.unitPrice * (1 + rate / 100));
      const unitCode = compactText(item.unit || 'unit');

      const taxKey = `${rate}`;
      const currentGroup = taxGroups.get(taxKey) || {
        rate,
        taxableAmount: 0,
        taxAmount: 0,
        taxInclusiveAmount: 0,
        vatApplicable: rate > 0,
      };

      currentGroup.taxableAmount = roundCurrency(currentGroup.taxableAmount + item.totalPrice);
      currentGroup.taxAmount = roundCurrency(currentGroup.taxAmount + lineTaxAmount);
      currentGroup.taxInclusiveAmount = roundCurrency(
        currentGroup.taxInclusiveAmount + lineTaxInclusiveAmount,
      );
      currentGroup.vatApplicable = currentGroup.vatApplicable || rate > 0;
      taxGroups.set(taxKey, currentGroup);

      return `      <InvoiceLine>
        <ID>${escapeXml(item.id || String(index + 1))}</ID>
        <InvoicedQuantity unitCode="${escapeXml(unitCode)}">${escapeXml(item.quantity)}</InvoicedQuantity>
        <LineExtensionAmount>${escapeXml(formatAmount(item.totalPrice))}</LineExtensionAmount>
        <LineExtensionAmountTaxInclusive>${escapeXml(formatAmount(lineTaxInclusiveAmount))}</LineExtensionAmountTaxInclusive>
        <LineExtensionTaxAmount>${escapeXml(formatAmount(lineTaxAmount))}</LineExtensionTaxAmount>
        <UnitPrice>${escapeXml(formatAmount(item.unitPrice))}</UnitPrice>
        <UnitPriceTaxInclusive>${escapeXml(formatAmount(unitPriceTaxInclusive))}</UnitPriceTaxInclusive>
        <ClassifiedTaxCategory>
          <Percent>${escapeXml(formatPercent(rate))}</Percent>
          <VATCalculationMethod>0</VATCalculationMethod>
          <VATApplicable>${rate > 0 ? 'true' : 'false'}</VATApplicable>
        </ClassifiedTaxCategory>
        <Item>
          <Description>${escapeXml(item.description)}</Description>
        </Item>
      </InvoiceLine>`;
    })
    .join('\n');

  const taxSubtotalsXml = Array.from(taxGroups.values())
    .sort((a, b) => a.rate - b.rate)
    .map(
      (group) => `    <TaxSubTotal>
      <TaxableAmount>${escapeXml(formatAmount(group.taxableAmount))}</TaxableAmount>
      <TaxAmount>${escapeXml(formatAmount(group.taxAmount))}</TaxAmount>
      <TaxInclusiveAmount>${escapeXml(formatAmount(group.taxInclusiveAmount))}</TaxInclusiveAmount>
      <AlreadyClaimedTaxableAmount>0.00</AlreadyClaimedTaxableAmount>
      <AlreadyClaimedTaxAmount>0.00</AlreadyClaimedTaxAmount>
      <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
      <DifferenceTaxableAmount>${escapeXml(formatAmount(group.taxableAmount))}</DifferenceTaxableAmount>
      <DifferenceTaxAmount>${escapeXml(formatAmount(group.taxAmount))}</DifferenceTaxAmount>
      <DifferenceTaxInclusiveAmount>${escapeXml(formatAmount(group.taxInclusiveAmount))}</DifferenceTaxInclusiveAmount>
      <TaxCategory>
        <Percent>${escapeXml(formatPercent(group.rate))}</Percent>
        <VATApplicable>${group.vatApplicable ? 'true' : 'false'}</VATApplicable>
      </TaxCategory>
    </TaxSubTotal>`,
    )
    .join('\n');

  const totalTaxAmount = Array.from(taxGroups.values()).reduce(
    (sum, group) => roundCurrency(sum + group.taxAmount),
    0,
  );

  const paymentMeansXml = `  <PaymentMeans>
    <Payment>
      <PaidAmount>${escapeXml(formatAmount(invoice.total))}</PaidAmount>
      <PaymentMeansCode>${escapeXml(getPaymentMeansCode(invoice.paymentMethod))}</PaymentMeansCode>
    </Payment>
  </PaymentMeans>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2">
  <DocumentType>1</DocumentType>
  <SubDocumentType>invoice</SubDocumentType>
  <SubDocumentTypeOrigin>https://faktoro.app/isdoc/subdocument-type</SubDocumentTypeOrigin>
  <ID>${escapeXml(invoice.invoiceNumber)}</ID>
  <UUID>${escapeXml(invoiceUuid)}</UUID>
  <IssuingSystem>Faktoro</IssuingSystem>
  <IssueDate>${escapeXml(isoDateFromMs(invoice.issuedAt))}</IssueDate>
  <TaxPointDate>${escapeXml(isoDateFromMs(invoice.taxableAt || invoice.issuedAt))}</TaxPointDate>
  <VATApplicable>${vatApplicable ? 'true' : 'false'}</VATApplicable>
  <ElectronicPossibilityAgreementReference>Generated electronically by Faktoro</ElectronicPossibilityAgreementReference>
  ${invoiceNote ? `<Note>${escapeXml(invoiceNote)}</Note>` : ''}
  <LocalCurrencyCode>${escapeXml(localCurrencyCode)}</LocalCurrencyCode>
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>
    ${buildPartyXml(seller, seller.companyId || seller.vatNumber || invoice.id, 'Supplier')}
  </AccountingSupplierParty>
  ${anonymousCustomerParty ? '<AnonymousCustomerParty>true</AnonymousCustomerParty>' : ''}
  <AccountingCustomerParty>
    ${buildPartyXml(buyer, buyer.companyId || invoice.clientId || invoice.id, 'Customer')}
  </AccountingCustomerParty>${
    buyerReference
      ? `
  <OrderReferences>
    <OrderReference>
      <SalesOrderID>${escapeXml(buyerReference)}</SalesOrderID>
      <ExternalOrderID>${escapeXml(buyerReference)}</ExternalOrderID>
    </OrderReference>
  </OrderReferences>`
      : ''
  }
  <InvoiceLines>
${linesXml}
  </InvoiceLines>
  <TaxTotal>
${taxSubtotalsXml}
    <TaxAmount>${escapeXml(formatAmount(totalTaxAmount))}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${escapeXml(formatAmount(invoice.subtotal))}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${escapeXml(formatAmount(invoice.total))}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount>0.00</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>${escapeXml(formatAmount(invoice.subtotal))}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount>${escapeXml(formatAmount(invoice.total))}</DifferenceTaxInclusiveAmount>
    <PaidDepositsAmount>0.00</PaidDepositsAmount>
    <PayableAmount>${escapeXml(formatAmount(invoice.total))}</PayableAmount>
  </LegalMonetaryTotal>
${paymentMeansXml}
</Invoice>`;
}
