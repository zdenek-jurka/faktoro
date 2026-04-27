import { escapeXml, isoDateFromMs } from './shared';
import type {
  BuyerSnapshot,
  InvoiceXmlBuildInput,
  InvoiceXmlFormat,
  SellerSnapshot,
} from './types';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { resolveUneceUnitCode } from '@/utils/e-invoice-unit-code';
import { roundCurrency } from '@/utils/money';

const PEPPOL_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
const XRECHNUNG_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
const BILLING_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

type UblPartyRole = 'buyer' | 'seller';

type TaxGroup = {
  categoryCode: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
};

function compactText(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function formatAmount(value: number): string {
  return roundCurrency(value).toFixed(2);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function resolveCountryCode(country?: string): string {
  const trimmed = compactText(country).toUpperCase();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  return 'CZ';
}

function resolveCustomizationId(format: InvoiceXmlFormat): string {
  return format === 'xrechnung' ? XRECHNUNG_CUSTOMIZATION_ID : PEPPOL_CUSTOMIZATION_ID;
}

function resolvePaymentMeansCode(paymentMethod?: string): string {
  if (paymentMethod === 'cash') return '10';
  if (paymentMethod === 'card' || paymentMethod === 'card_nfc') return '48';
  return '30';
}

function isBankTransfer(paymentMethod?: string): boolean {
  return !paymentMethod || paymentMethod === 'bank_transfer';
}

function getPartyName(party: BuyerSnapshot | SellerSnapshot, role: UblPartyRole): string {
  const name =
    role === 'seller' ? (party as SellerSnapshot).companyName : (party as BuyerSnapshot).name;
  return compactText(name) || (role === 'seller' ? 'Seller' : 'Buyer');
}

function getEndpointXml(party: BuyerSnapshot | SellerSnapshot): string {
  const email = compactText(party.email);
  if (!email) return '';
  return `      <cbc:EndpointID schemeID="EM">${escapeXml(email)}</cbc:EndpointID>
`;
}

function getPartyIdentificationXml(party: BuyerSnapshot | SellerSnapshot): string {
  const companyId = compactText(party.companyId);
  if (!companyId) return '';
  return `      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(companyId)}</cbc:ID>
      </cac:PartyIdentification>
`;
}

function getPartyTaxSchemeXml(party: BuyerSnapshot | SellerSnapshot): string {
  const vatNumber = compactText(party.vatNumber);
  if (!vatNumber) return '';
  return `      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
`;
}

function getPartyLegalEntityXml(party: BuyerSnapshot | SellerSnapshot, partyName: string): string {
  const companyId = compactText(party.companyId);
  return `      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(partyName)}</cbc:RegistrationName>${
          companyId ? `\n        <cbc:CompanyID>${escapeXml(companyId)}</cbc:CompanyID>` : ''
        }
      </cac:PartyLegalEntity>
`;
}

function getContactXml(party: BuyerSnapshot | SellerSnapshot): string {
  const phone = compactText(party.phone);
  const email = compactText(party.email);
  if (!phone && !email) return '';

  return `      <cac:Contact>${
    phone ? `\n        <cbc:Telephone>${escapeXml(phone)}</cbc:Telephone>` : ''
  }${email ? `\n        <cbc:ElectronicMail>${escapeXml(email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>
`;
}

function getPostalAddressXml(party: BuyerSnapshot | SellerSnapshot): string {
  const street = compactText(party.address);
  const additionalStreet = compactText(party.street2);
  const city = compactText(party.city);
  const postalCode = compactText(party.postalCode);
  const country = resolveCountryCode(party.country);

  return `      <cac:PostalAddress>${
    street ? `\n        <cbc:StreetName>${escapeXml(street)}</cbc:StreetName>` : ''
  }${
    additionalStreet
      ? `\n        <cbc:AdditionalStreetName>${escapeXml(additionalStreet)}</cbc:AdditionalStreetName>`
      : ''
  }${city ? `\n        <cbc:CityName>${escapeXml(city)}</cbc:CityName>` : ''}${
    postalCode ? `\n        <cbc:PostalZone>${escapeXml(postalCode)}</cbc:PostalZone>` : ''
  }
        <cac:Country><cbc:IdentificationCode>${escapeXml(country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
`;
}

function getPartyXml(party: BuyerSnapshot | SellerSnapshot, role: UblPartyRole): string {
  const partyName = getPartyName(party, role);
  return `    <cac:Party>
${getEndpointXml(party)}${getPartyIdentificationXml(party)}      <cac:PartyName><cbc:Name>${escapeXml(partyName)}</cbc:Name></cac:PartyName>
${getPostalAddressXml(party)}${getPartyTaxSchemeXml(party)}${getPartyLegalEntityXml(
    party,
    partyName,
  )}${getContactXml(party)}    </cac:Party>`;
}

function getTaxCategoryCode(rate: number): string {
  return rate > 0 ? 'S' : 'Z';
}

function getTaxCategoryXml(rate: number): string {
  return `<cbc:ID>${escapeXml(getTaxCategoryCode(rate))}</cbc:ID>
          <cbc:Percent>${escapeXml(formatPercent(rate))}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
}

function getTaxGroups(items: InvoiceXmlBuildInput['items']): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();

  for (const item of items) {
    const rate = Number(item.vatRate ?? 0);
    const categoryCode = getTaxCategoryCode(rate);
    const key = `${categoryCode}:${rate}`;
    const current = groups.get(key) || {
      categoryCode,
      rate,
      taxableAmount: 0,
      taxAmount: 0,
    };

    current.taxableAmount = roundCurrency(current.taxableAmount + item.totalPrice);
    current.taxAmount = roundCurrency(current.taxAmount + item.totalPrice * (rate / 100));
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((left, right) => left.rate - right.rate);
}

function getTaxTotalXml(taxGroups: TaxGroup[], currency: string): string {
  const totalTaxAmount = taxGroups.reduce((sum, group) => roundCurrency(sum + group.taxAmount), 0);
  const subtotalsXml = taxGroups
    .map(
      (group) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${escapeXml(currency)}">${escapeXml(
        formatAmount(group.taxableAmount),
      )}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(group.taxAmount))}</cbc:TaxAmount>
      <cac:TaxCategory>
        ${getTaxCategoryXml(group.rate)}
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join('\n');

  return `  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(totalTaxAmount))}</cbc:TaxAmount>
${subtotalsXml}
  </cac:TaxTotal>`;
}

function getPaymentMeansXml(
  invoice: InvoiceXmlBuildInput['invoice'],
  seller: SellerSnapshot,
): string {
  const paymentMeansCode = resolvePaymentMeansCode(invoice.paymentMethod);
  const accountId = compactText(seller.iban) || compactText(seller.bankAccount);
  const swift = compactText(seller.swift);

  if (!isBankTransfer(invoice.paymentMethod) || !accountId) {
    return `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${escapeXml(paymentMeansCode)}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>`;
  }

  return `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${escapeXml(paymentMeansCode)}</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${escapeXml(accountId)}</cbc:ID>${
        swift
          ? `\n      <cac:FinancialInstitutionBranch><cbc:ID>${escapeXml(swift)}</cbc:ID></cac:FinancialInstitutionBranch>`
          : ''
      }
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`;
}

function getInvoiceLinesXml(items: InvoiceXmlBuildInput['items'], currency: string): string {
  return items
    .map((item, index) => {
      const rate = Number(item.vatRate ?? 0);
      const unitCode = resolveUneceUnitCode(item.unit) || 'C62';
      const description = compactText(item.description) || `Item ${index + 1}`;

      return `  <cac:InvoiceLine>
    <cbc:ID>${escapeXml(index + 1)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(unitCode)}">${escapeXml(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${escapeXml(
      formatAmount(item.totalPrice),
    )}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${escapeXml(description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        ${getTaxCategoryXml(rate)}
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(item.unitPrice))}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('\n');
}

export function buildUblInvoiceXml(
  format: Extract<InvoiceXmlFormat, 'peppol' | 'xrechnung'>,
  { invoice, items, buyer, seller }: InvoiceXmlBuildInput,
): string {
  const currency = normalizeCurrencyCode(invoice.currency);
  const issueDate = isoDateFromMs(invoice.issuedAt);
  const dueDate = isoDateFromMs(invoice.dueAt);
  const taxPointDate = isoDateFromMs(invoice.taxableAt);
  const note = compactText(invoice.footerNote || invoice.headerNote);
  const buyerReference = compactText(invoice.buyerReference);
  const taxGroups = getTaxGroups(items);
  const taxAmount = taxGroups.reduce((sum, group) => roundCurrency(sum + group.taxAmount), 0);
  const lineExtensionAmount = roundCurrency(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const taxInclusiveAmount = roundCurrency(lineExtensionAmount + taxAmount);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${escapeXml(resolveCustomizationId(format))}</cbc:CustomizationID>
  <cbc:ProfileID>${escapeXml(BILLING_PROFILE_ID)}</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${escapeXml(issueDate)}</cbc:IssueDate>${
    dueDate ? `\n  <cbc:DueDate>${escapeXml(dueDate)}</cbc:DueDate>` : ''
  }
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>${note ? `\n  <cbc:Note>${escapeXml(note)}</cbc:Note>` : ''}${
    taxPointDate ? `\n  <cbc:TaxPointDate>${escapeXml(taxPointDate)}</cbc:TaxPointDate>` : ''
  }
  <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>${
    buyerReference
      ? `\n  <cbc:BuyerReference>${escapeXml(buyerReference)}</cbc:BuyerReference>`
      : ''
  }
  <cac:AccountingSupplierParty>
${getPartyXml(seller, 'seller')}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
${getPartyXml(buyer, 'buyer')}
  </cac:AccountingCustomerParty>
${getPaymentMeansXml(invoice, seller)}
${getTaxTotalXml(taxGroups, currency)}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(lineExtensionAmount))}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(lineExtensionAmount))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(taxInclusiveAmount))}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(currency)}">${escapeXml(formatAmount(taxInclusiveAmount))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${getInvoiceLinesXml(items, currency)}
</Invoice>`;
}
