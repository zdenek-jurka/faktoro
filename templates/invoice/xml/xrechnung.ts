import { escapeXml, isoDateFromMs } from './shared';
import type { InvoiceXmlBuildInput } from './types';

export function buildXrechnungXml({ invoice, items, buyer, seller }: InvoiceXmlBuildInput): string {
  const linesXml = items
    .map(
      (item, index) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct><ram:Name>${escapeXml(item.description)}</ram:Name></ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement><ram:GrossPriceProductTradePrice><ram:ChargeAmount>${escapeXml(item.unitPrice.toFixed(2))}</ram:ChargeAmount></ram:GrossPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity>${escapeXml(item.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${escapeXml(item.totalPrice.toFixed(2))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoice.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${escapeXml(isoDateFromMs(invoice.issuedAt).replaceAll('-', ''))}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${linesXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${escapeXml(seller.companyName)}</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(buyer.address)}</ram:LineOne>
          <ram:CityName>${escapeXml(buyer.city)}</ram:CityName>
          <ram:PostcodeCode>${escapeXml(buyer.postalCode)}</ram:PostcodeCode>
          <ram:CountryID>${escapeXml(buyer.country || '')}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(invoice.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${escapeXml(invoice.subtotal.toFixed(2))}</ram:LineTotalAmount>
        <ram:GrandTotalAmount>${escapeXml(invoice.total.toFixed(2))}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${escapeXml(invoice.total.toFixed(2))}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
