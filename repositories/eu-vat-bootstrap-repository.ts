import { normalizeEuMemberStateCode, type EuMemberStateCode } from '@/constants/eu-countries';

const TEDB_URL = 'https://ec.europa.eu/taxation_customs/tedb/ws/';
const TEDB_SOAP_ACTION =
  'urn:ec.europa.eu:taxud:tedb:services:v1:VatRetrievalService/RetrieveVatRates';

type TedbRateType = 'STANDARD' | 'REDUCED';
type TedbRateValueType =
  | 'DEFAULT'
  | 'REDUCED_RATE'
  | 'SUPER_REDUCED_RATE'
  | 'PARKING_RATE'
  | 'NOT_APPLICABLE'
  | 'OUT_OF_SCOPE'
  | 'EXEMPTED';

export type EuVatBootstrapRateKind = 'standard' | 'reduced' | 'superReduced' | 'parking' | 'exempt';

export type EuVatBootstrapRate = {
  kind: EuVatBootstrapRateKind;
  ratePercent: number;
  validFrom: number | null;
  tedbRateValueType: TedbRateValueType;
};

export type EuVatBootstrapPreview = {
  memberState: EuMemberStateCode;
  fetchedAt: number;
  rates: EuVatBootstrapRate[];
};

function buildEnvelope(memberState: EuMemberStateCode) {
  const today = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService" xmlns:typ="urn:ec.europa.eu:taxud:tedb:services:v1:IVatRetrievalService:types">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:retrieveVatRatesReqMsg>
      <typ:memberStates>
        <typ:isoCode>${memberState}</typ:isoCode>
      </typ:memberStates>
      <typ:situationOn>${today}</typ:situationOn>
    </ser:retrieveVatRatesReqMsg>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

function getTagValue(block: string, tagName: string): string | null {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match?.[1] ? decodeXmlEntities(match[1].trim()) : null;
}

function parseLocalDateStart(value: string | null): number | null {
  if (!value) return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function parseRateBlocks(xml: string) {
  return xml.match(/<vatRateResults>[\s\S]*?<\/vatRateResults>/g) ?? [];
}

function resolveKind(
  tedbType: TedbRateType,
  tedbRateValueType: TedbRateValueType,
): EuVatBootstrapRateKind | null {
  if (tedbType === 'STANDARD' && tedbRateValueType === 'DEFAULT') {
    return 'standard';
  }

  if (tedbType !== 'REDUCED') {
    return null;
  }

  switch (tedbRateValueType) {
    case 'REDUCED_RATE':
      return 'reduced';
    case 'SUPER_REDUCED_RATE':
      return 'superReduced';
    case 'PARKING_RATE':
      return 'parking';
    case 'EXEMPTED':
      return 'exempt';
    default:
      return null;
  }
}

function getRateValue(block: string): number | null {
  const directValue = getTagValue(block, 'value');
  if (directValue == null || directValue === '') {
    return null;
  }

  const parsed = Number.parseFloat(directValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortRates(a: EuVatBootstrapRate, b: EuVatBootstrapRate) {
  const order: Record<EuVatBootstrapRateKind, number> = {
    standard: 0,
    reduced: 1,
    superReduced: 2,
    parking: 3,
    exempt: 4,
  };

  if (order[a.kind] !== order[b.kind]) {
    return order[a.kind] - order[b.kind];
  }

  if (a.ratePercent !== b.ratePercent) {
    return b.ratePercent - a.ratePercent;
  }

  return (a.validFrom ?? Number.MAX_SAFE_INTEGER) - (b.validFrom ?? Number.MAX_SAFE_INTEGER);
}

export async function fetchEuVatBootstrapPreview(
  memberStateInput: string,
): Promise<EuVatBootstrapPreview> {
  const memberState = normalizeEuMemberStateCode(memberStateInput);

  if (!memberState) {
    throw new Error('EU_VAT_BOOTSTRAP_INVALID_COUNTRY');
  }

  const response = await fetch(TEDB_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/xml',
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: TEDB_SOAP_ACTION,
    },
    body: buildEnvelope(memberState),
  });

  const responseText = await response.text();
  const faultString = getTagValue(responseText, 'faultstring');

  if (faultString) {
    throw new Error(faultString);
  }

  if (!response.ok) {
    throw new Error(`EU_VAT_BOOTSTRAP_HTTP_${response.status}`);
  }

  const grouped = new Map<string, EuVatBootstrapRate>();

  for (const block of parseRateBlocks(responseText)) {
    const resultMemberState = getTagValue(block, 'memberState');
    if (resultMemberState !== memberState) continue;

    const tedbType = getTagValue(block, 'type') as TedbRateType | null;
    const rateBlockMatch = block.match(/<rate>([\s\S]*?)<\/rate>/);
    const rateBlock = rateBlockMatch?.[1] ?? '';
    const tedbRateValueType = getTagValue(rateBlock, 'type') as TedbRateValueType | null;

    if (!tedbType || !tedbRateValueType) continue;

    const kind = resolveKind(tedbType, tedbRateValueType);
    if (!kind) continue;

    const rawRateValue = getRateValue(rateBlock);
    const ratePercent = rawRateValue ?? (tedbRateValueType === 'EXEMPTED' ? 0 : null);
    if (ratePercent == null) continue;

    const validFrom = parseLocalDateStart(getTagValue(block, 'situationOn'));
    const mapKey = `${kind}:${ratePercent}`;
    const existing = grouped.get(mapKey);

    if (existing) {
      if (validFrom != null && (existing.validFrom == null || validFrom < existing.validFrom)) {
        existing.validFrom = validFrom;
      }
      continue;
    }

    grouped.set(mapKey, {
      kind,
      ratePercent,
      validFrom,
      tedbRateValueType,
    });
  }

  const rates = [...grouped.values()].sort(sortRates);

  if (rates.length === 0) {
    throw new Error('EU_VAT_BOOTSTRAP_EMPTY');
  }

  return {
    memberState,
    fetchedAt: Date.now(),
    rates,
  };
}
