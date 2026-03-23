import type { ClientModel, TimeEntryModel, TimesheetModel } from '@/model';
import { escapeXml, isoDateFromMs } from '@/templates/invoice/xml/shared';

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

export function buildTimesheetXml(input: TimesheetXmlBuildInput): string {
  const { timesheet, client, entries } = input;

  const totalSeconds = entries.reduce(
    (sum, e) => sum + (e.timesheetDuration ?? e.duration ?? 0),
    0,
  );
  const totalHours = totalSeconds / 3600;

  const entriesXml = entries
    .map((entry) => {
      const durationSec = entry.timesheetDuration ?? entry.duration ?? 0;
      const durationHours = durationSec / 3600;
      const rateBlock =
        entry.rate != null
          ? `\n      <Rate>${escapeXml(formatDecimal(entry.rate, 2))}</Rate>\n      <RateCurrency>${escapeXml(entry.rateCurrency)}</RateCurrency>`
          : '';
      return `    <Entry>
      <Id>${escapeXml(entry.id)}</Id>
      <Description>${escapeXml(entry.description)}</Description>
      <StartTime>${escapeXml(isoDateTimeFromMs(entry.startTime))}</StartTime>
      <EndTime>${escapeXml(isoDateTimeFromMs(entry.endTime))}</EndTime>
      <DurationSeconds>${durationSec}</DurationSeconds>
      <DurationHours>${escapeXml(formatDecimal(durationHours))}</DurationHours>${rateBlock}
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
  </Summary>
  <Entries>
${entriesXml}
  </Entries>
</Timesheet>
`;
}
