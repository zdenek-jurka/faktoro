import type { ClientModel, TimeEntryModel, TimesheetModel } from '@/model';
import { escapeXml, isoDateFromMs } from '@/templates/invoice/xml/shared';
import { normalizeCurrencyCode } from '@/utils/currency-utils';

export type TimesheetXmlBuildInput = {
  timesheet: TimesheetModel;
  client: ClientModel | null;
  entries: TimeEntryModel[];
};

function isoDateTimeFromMs(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().replace('Z', '+00:00');
}

function formatDecimal(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

function getEntryBilling(entry: TimeEntryModel, durationSeconds: number) {
  const rate = entry.rate;
  if (rate == null || !Number.isFinite(rate)) return null;

  const amount = (durationSeconds / 3600) * rate;
  if (!Number.isFinite(amount)) return null;

  return {
    rate,
    currency: normalizeCurrencyCode(entry.rateCurrency),
    amount,
  };
}

function getSourceDeviceXml(entry: TimeEntryModel): string {
  const sourceDeviceId = entry.sourceDeviceId?.trim() || entry.runningDeviceId?.trim() || '';
  const sourceDeviceName = entry.sourceDeviceName?.trim() || entry.runningDeviceName?.trim() || '';
  if (!sourceDeviceId && !sourceDeviceName) return '';

  const idXml = sourceDeviceId ? `\n        <Id>${escapeXml(sourceDeviceId)}</Id>` : '';
  const nameXml = sourceDeviceName ? `\n        <Name>${escapeXml(sourceDeviceName)}</Name>` : '';

  return `\n      <SourceDevice>${idXml}${nameXml}
      </SourceDevice>`;
}

function getBillingSummaryXml(entries: TimeEntryModel[]): string {
  const totalsByCurrency = new Map<string, number>();
  let unpricedEntries = 0;

  for (const entry of entries) {
    const durationSeconds = entry.timesheetDuration ?? entry.duration ?? 0;
    const billing = getEntryBilling(entry, durationSeconds);
    if (!billing) {
      unpricedEntries += 1;
      continue;
    }

    totalsByCurrency.set(
      billing.currency,
      (totalsByCurrency.get(billing.currency) ?? 0) + billing.amount,
    );
  }

  if (totalsByCurrency.size === 0) return '';

  const totalsXml = Array.from(totalsByCurrency.entries())
    .sort(([leftCurrency], [rightCurrency]) => leftCurrency.localeCompare(rightCurrency))
    .map(
      ([currency, amount]) => `        <Total>
          <Currency>${escapeXml(currency)}</Currency>
          <Amount>${escapeXml(formatDecimal(amount, 2))}</Amount>
        </Total>`,
    )
    .join('\n');

  return `    <BillingSummary>
      <UnpricedEntries>${unpricedEntries}</UnpricedEntries>
      <Totals>
${totalsXml}
      </Totals>
    </BillingSummary>`;
}

export function buildTimesheetXml(input: TimesheetXmlBuildInput): string {
  const { timesheet, client, entries } = input;

  const totalSeconds = entries.reduce(
    (sum, e) => sum + (e.timesheetDuration ?? e.duration ?? 0),
    0,
  );
  const totalHours = totalSeconds / 3600;
  const billingSummaryXml = getBillingSummaryXml(entries);

  const entriesXml = entries
    .map((entry) => {
      const durationSec = entry.timesheetDuration ?? entry.duration ?? 0;
      const durationHours = durationSec / 3600;
      const sourceDeviceBlock = getSourceDeviceXml(entry);
      const billing = getEntryBilling(entry, durationSec);
      const rateBlock =
        billing != null
          ? `\n      <Rate>${escapeXml(formatDecimal(billing.rate, 2))}</Rate>\n      <RateCurrency>${escapeXml(billing.currency)}</RateCurrency>\n      <Amount>${escapeXml(formatDecimal(billing.amount, 2))}</Amount>`
          : '';
      return `    <Entry>
      <Id>${escapeXml(entry.id)}</Id>
      <Description>${escapeXml(entry.description)}</Description>
      <StartTime>${escapeXml(isoDateTimeFromMs(entry.startTime))}</StartTime>
      <EndTime>${escapeXml(isoDateTimeFromMs(entry.endTime))}</EndTime>
      <DurationSeconds>${durationSec}</DurationSeconds>
      <DurationHours>${escapeXml(formatDecimal(durationHours))}</DurationHours>${sourceDeviceBlock}${rateBlock}
    </Entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Timesheet xmlns="https://faktoro.app/xml/timesheet/1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="https://faktoro.app/xml/timesheet/1.0 timesheet.xsd">
  <Id>${escapeXml(timesheet.id)}</Id>
  <Number>${escapeXml(timesheet.timesheetNumber)}</Number>
  <Label>${escapeXml(timesheet.label)}</Label>
  <Client>
    <Id>${escapeXml(client?.id)}</Id>
    <Name>${escapeXml(client?.name)}</Name>
  </Client>
  <Period>
    <Type>${escapeXml(timesheet.periodType)}</Type>
    <From>${escapeXml(isoDateFromMs(timesheet.periodFrom))}</From>
    <To>${escapeXml(isoDateFromMs(timesheet.periodTo))}</To>
  </Period>
  <Summary>
    <TotalEntries>${entries.length}</TotalEntries>
    <TotalDurationSeconds>${totalSeconds}</TotalDurationSeconds>
    <TotalDurationHours>${escapeXml(formatDecimal(totalHours))}</TotalDurationHours>
${billingSummaryXml ? billingSummaryXml : ''}
  </Summary>
  <Entries>
${entriesXml}
  </Entries>
</Timesheet>
`;
}
