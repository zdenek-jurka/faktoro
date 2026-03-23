import database from '@/db';
import { AppSettingsModel, ClientModel, TimeEntryModel, TimesheetModel } from '@/model';
import { getDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import { buildSeriesIdentifier } from '@/utils/series-utils';
import { roundTimeByInterval } from '@/utils/time-utils';
import { Q } from '@nozbe/watermelondb';

export type TimesheetPreset =
  | 'all'
  | 'custom'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'this_week'
  | 'last_week'
  | 'last_7_days';

export type CreateTimesheetInput = {
  clientId: string;
  periodType: TimesheetPreset;
  periodFrom?: number;
  periodTo?: number;
  label?: string;
};

function buildTimesheetNumberFromSettings(
  settings?: AppSettingsModel,
  deviceSettings?: {
    syncDeviceName?: string;
    syncDeviceId?: string;
  },
): string {
  return buildSeriesIdentifier({
    pattern: settings?.timesheetSeriesPattern,
    fallbackPattern: 'TS-YY-####',
    prefix: settings?.timesheetSeriesPrefix,
    nextNumber: settings?.timesheetSeriesNextNumber,
    padding: settings?.timesheetSeriesPadding,
    perDevice: settings?.timesheetSeriesPerDevice,
    deviceCode: settings?.timesheetSeriesDeviceCode,
    syncDeviceName: deviceSettings?.syncDeviceName,
    syncDeviceId: deviceSettings?.syncDeviceId,
    fallbackPrefix: 'TS',
  });
}

export function getTimesheets() {
  return database.get<TimesheetModel>(TimesheetModel.table).query(Q.sortBy('created_at', Q.desc));
}

export async function getSuggestedTimesheetNumber(): Promise<string> {
  const settings = await getSettings();
  const deviceSettings = await getDeviceSyncSettings(settings);
  return buildTimesheetNumberFromSettings(settings, deviceSettings);
}

function getEntryEffectiveEndTime(entry: TimeEntryModel): number {
  if (typeof entry.endTime === 'number' && Number.isFinite(entry.endTime)) {
    return Math.max(entry.startTime, entry.endTime);
  }

  if (typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0) {
    return entry.startTime + entry.duration * 1000;
  }

  return entry.startTime;
}

function entryOverlapsPeriod(entry: TimeEntryModel, periodFrom: number, periodTo: number): boolean {
  return entry.startTime <= periodTo && getEntryEffectiveEndTime(entry) >= periodFrom;
}

export async function createTimesheetFromPeriod(
  input: CreateTimesheetInput,
): Promise<{ timesheet: TimesheetModel | null; entriesCount: number }> {
  const clientCollection = database.get<ClientModel>(ClientModel.table);
  const timesheetCollection = database.get<TimesheetModel>(TimesheetModel.table);
  const timeEntryCollection = database.get<TimeEntryModel>(TimeEntryModel.table);
  const settings = await getSettings();
  const deviceSettings = await getDeviceSyncSettings(settings);

  return database.write(async () => {
    const client = await clientCollection.find(input.clientId);
    const timesheetNumber = buildTimesheetNumberFromSettings(settings, deviceSettings);
    const baseQuery = [
      Q.where('client_id', input.clientId),
      Q.where('timesheet_id', null),
      Q.where('is_running', false),
    ] as const;

    const fetchedEntries = await timeEntryCollection
      .query(
        ...baseQuery,
        ...(input.periodType === 'all'
          ? []
          : [Q.where('start_time', Q.lte(input.periodTo ?? Date.now()))]),
      )
      .fetch();

    const entries =
      input.periodType === 'all'
        ? fetchedEntries
        : fetchedEntries.filter((entry) =>
            entryOverlapsPeriod(entry, input.periodFrom ?? 0, input.periodTo ?? Date.now()),
          );

    if (entries.length === 0) {
      return { timesheet: null, entriesCount: 0 };
    }

    const resolvedPeriodFrom =
      input.periodType === 'all'
        ? Math.min(...entries.map((entry) => entry.startTime))
        : (input.periodFrom ?? 0);
    const resolvedPeriodTo =
      input.periodType === 'all'
        ? Math.max(...entries.map((entry) => getEntryEffectiveEndTime(entry)))
        : (input.periodTo ?? Date.now());

    const timesheet = await timesheetCollection.create((item: TimesheetModel) => {
      item.clientId = input.clientId;
      item.periodType = input.periodType;
      item.periodFrom = resolvedPeriodFrom;
      item.periodTo = resolvedPeriodTo;
      item.timesheetNumber = timesheetNumber;
      item.label = input.label?.trim() || undefined;
    });

    for (const entry of entries) {
      await entry.update((e: TimeEntryModel) => {
        e.timesheetId = timesheet.id;
        e.timesheetDuration = roundTimeByInterval(
          entry.duration || 0,
          client,
          settings.defaultBillingInterval,
        );
      });
    }

    await settings.update((currentSettings: AppSettingsModel) => {
      const current = Math.max(1, Math.floor(currentSettings.timesheetSeriesNextNumber || 1));
      currentSettings.timesheetSeriesNextNumber = current + 1;
    });

    return { timesheet, entriesCount: entries.length };
  });
}
