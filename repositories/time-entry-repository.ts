import database from '@/db';
import AppSettingsModel from '@/model/AppSettingsModel';
import ClientModel from '@/model/ClientModel';
import TimeEntryModel from '@/model/TimeEntryModel';
import { getLocalDeviceContext } from '@/repositories/device-sync-settings-repository';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import {
  normalizeTimerLimitMode,
  sanitizeTimerLimitMinutes,
  type TimerLimitMode,
} from '@/utils/timer-limit-utils';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import { Q } from '@nozbe/watermelondb';

export type CreateTimeEntryInput = {
  clientId: string;
  description?: string;
  startTime: number;
  priceListItemId?: string;
  rate?: number;
  rateCurrency?: string;
};

type DeviceContext = {
  deviceId?: string;
  deviceName?: string;
};

export type ResolvedTimerLimits = {
  softLimitMinutes?: number;
  hardLimitMinutes?: number;
};

export const TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN = 'TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN';
export const TIME_ENTRY_LOCAL_RUNNING_EXISTS = 'TIME_ENTRY_LOCAL_RUNNING_EXISTS';

async function getCurrentDeviceContext(): Promise<DeviceContext> {
  return getLocalDeviceContext();
}

function normalizeDeviceId(deviceId?: string | null): string | null {
  const normalized = deviceId?.trim();
  return normalized ? normalized : null;
}

function isEntryOwnedByDevice(entry: TimeEntryModel, deviceId?: string): boolean {
  const normalizedEntryDeviceId = normalizeDeviceId(entry.runningDeviceId);
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    return normalizedEntryDeviceId === null;
  }

  return normalizedEntryDeviceId === normalizedDeviceId;
}

async function getRunningEntriesForDevice(
  timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table),
  deviceId?: string,
): Promise<TimeEntryModel[]> {
  const runningEntries = await timeEntries
    .query(Q.where('is_running', true), Q.sortBy('start_time', Q.desc))
    .fetch();

  return runningEntries.filter((entry) => isEntryOwnedByDevice(entry, deviceId));
}

async function ensureCanControlEntry(entry: TimeEntryModel): Promise<void> {
  if (!entry.runningDeviceId) return;
  const { deviceId } = await getCurrentDeviceContext();
  if (!deviceId || entry.runningDeviceId !== deviceId) {
    throw new Error(TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN);
  }
}

async function getClientTimerLimitMode(clientId: string): Promise<{
  client: ClientModel;
  mode: TimerLimitMode;
}> {
  const client = await database.get<ClientModel>(ClientModel.table).find(clientId);
  return {
    client,
    mode: normalizeTimerLimitMode(client.timerLimitMode),
  };
}

export async function getEffectiveTimerLimitsForClient(
  clientId: string,
): Promise<ResolvedTimerLimits> {
  const settings = await database.get<AppSettingsModel>(AppSettingsModel.table).query().fetch();
  const appSettings = settings[0];
  const { client, mode } = await getClientTimerLimitMode(clientId);

  if (mode === 'disabled') {
    return {};
  }

  if (mode === 'custom') {
    return {
      softLimitMinutes: sanitizeTimerLimitMinutes(client.timerSoftLimitMinutes),
      hardLimitMinutes: sanitizeTimerLimitMinutes(client.timerHardLimitMinutes),
    };
  }

  return {
    softLimitMinutes:
      appSettings?.timerSoftLimitEnabled === false
        ? undefined
        : sanitizeTimerLimitMinutes(appSettings?.timerSoftLimitMinutes),
    hardLimitMinutes:
      appSettings?.timerHardLimitEnabled === false
        ? undefined
        : sanitizeTimerLimitMinutes(appSettings?.timerHardLimitMinutes),
  };
}

export async function getEffectiveTimerLimitsForEntry(
  entry: Pick<TimeEntryModel, 'clientId' | 'timerSoftLimitMinutes' | 'timerHardLimitMinutes'>,
): Promise<ResolvedTimerLimits> {
  const softLimitMinutes = sanitizeTimerLimitMinutes(entry.timerSoftLimitMinutes);
  const hardLimitMinutes = sanitizeTimerLimitMinutes(entry.timerHardLimitMinutes);

  if (softLimitMinutes !== undefined || hardLimitMinutes !== undefined) {
    return { softLimitMinutes, hardLimitMinutes };
  }

  return getEffectiveTimerLimitsForClient(entry.clientId);
}

export async function markTimeEntrySoftLimitNotified(
  id: string,
  notifiedAt = Date.now(),
): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    await entry.update((e: TimeEntryModel) => {
      e.softLimitNotifiedAt = notifiedAt;
    });
  });
}

export type UpdateTimeEntryInput = {
  id: string;
  description?: string;
  endTime?: number;
  duration?: number;
  isRunning?: boolean;
  priceListItemId?: string | null;
  rate?: number | null;
  rateCurrency?: string | null;
};

export async function createTimeEntry(input: CreateTimeEntryInput): Promise<TimeEntryModel> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);
  const { deviceId, deviceName } = await getCurrentDeviceContext();
  const resolvedTimerLimits = await getEffectiveTimerLimitsForClient(input.clientId);

  return await database.write(async () => {
    const runningEntriesForDevice = await getRunningEntriesForDevice(timeEntries, deviceId);
    if (runningEntriesForDevice.length > 0) {
      throw new Error(TIME_ENTRY_LOCAL_RUNNING_EXISTS);
    }

    return await timeEntries.create((entry: TimeEntryModel) => {
      entry.clientId = input.clientId;
      entry.description = input.description;
      entry.startTime = input.startTime;
      entry.priceListItemId = input.priceListItemId;
      entry.rate = input.rate;
      entry.rateCurrency =
        input.rate != null ? normalizeCurrencyCode(input.rateCurrency) : undefined;
      entry.timerSoftLimitMinutes = resolvedTimerLimits.softLimitMinutes;
      entry.timerHardLimitMinutes = resolvedTimerLimits.hardLimitMinutes;
      entry.softLimitNotifiedAt = undefined;
      entry.isRunning = true;
      entry.isPaused = false;
      entry.totalPausedDuration = 0;
      entry.runningDeviceId = deviceId;
      entry.runningDeviceName = deviceName;
    });
  });
}

export async function updateTimeEntry(input: UpdateTimeEntryInput): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(input.id);
    if (entry.isRunning) {
      await ensureCanControlEntry(entry);
    }
    await entry.update((e: TimeEntryModel) => {
      if (input.description !== undefined) e.description = input.description;
      if (input.endTime !== undefined) e.endTime = input.endTime;
      if (input.duration !== undefined) e.duration = input.duration;
      if (input.isRunning !== undefined) e.isRunning = input.isRunning;
      if (input.priceListItemId !== undefined) {
        e.priceListItemId = input.priceListItemId === null ? undefined : input.priceListItemId;
      }
      if (input.rate !== undefined) {
        e.rate = input.rate === null ? undefined : input.rate;
      }
      if (input.rateCurrency !== undefined) {
        e.rateCurrency =
          input.rateCurrency === null
            ? undefined
            : normalizeCurrencyCode(
                input.rateCurrency,
                entry.rateCurrency || DEFAULT_CURRENCY_CODE,
              );
      }
    });
  });
}

export async function stopTimeEntry(id: string, endTimeOverride?: number): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    await ensureCanControlEntry(entry);
    const endTime = endTimeOverride ?? Date.now();

    // If paused, add current pause duration to total
    let totalPausedDuration = entry.totalPausedDuration || 0;
    if (entry.isPaused && entry.pausedAt) {
      const currentPauseDuration = Math.floor((endTime - entry.pausedAt) / 1000);
      totalPausedDuration += currentPauseDuration;
    }

    // Calculate duration excluding paused time
    const totalDuration = Math.floor((endTime - entry.startTime) / 1000);
    const duration = totalDuration - totalPausedDuration;

    await entry.update((e: TimeEntryModel) => {
      e.endTime = endTime;
      e.duration = duration;
      e.isRunning = false;
      e.isPaused = false;
      e.pausedAt = undefined;
      e.totalPausedDuration = totalPausedDuration;
      e.runningDeviceId = undefined;
      e.runningDeviceName = undefined;
      e.softLimitNotifiedAt = undefined;
    });
  });
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    if (entry.isRunning) {
      await ensureCanControlEntry(entry);
    }
    await entry.markAsDeleted();
  });
}

export async function pauseTimeEntry(id: string): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    await ensureCanControlEntry(entry);
    const pausedAt = Date.now();
    const totalDuration = Math.floor((pausedAt - entry.startTime) / 1000);
    const pausedDuration = entry.totalPausedDuration || 0;
    const duration = Math.max(0, totalDuration - pausedDuration);

    await entry.update((e: TimeEntryModel) => {
      e.isPaused = true;
      e.pausedAt = pausedAt;
      e.duration = duration;
    });
  });
}

export async function resumeTimeEntry(id: string): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    await ensureCanControlEntry(entry);

    // Calculate how long we were paused and add to total
    if (entry.pausedAt) {
      const pauseDuration = Math.floor((Date.now() - entry.pausedAt) / 1000);
      const totalPausedDuration = (entry.totalPausedDuration || 0) + pauseDuration;

      await entry.update((e: TimeEntryModel) => {
        e.isPaused = false;
        e.pausedAt = undefined;
        e.totalPausedDuration = totalPausedDuration;
      });
    }
  });
}

export async function updateRunningEntryDuration(id: string, duration: number): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(id);
    await entry.update((e: TimeEntryModel) => {
      e.duration = duration;
    });
  });
}

export async function getRunningTimeEntry(): Promise<TimeEntryModel | null> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);
  const running = await timeEntries.query(Q.where('is_running', true)).fetch();
  return running.length > 0 ? running[0] : null;
}

export async function getCurrentDeviceRunningTimeEntry(): Promise<TimeEntryModel | null> {
  const { deviceId } = await getCurrentDeviceContext();
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);
  const runningEntries = await getRunningEntriesForDevice(timeEntries, deviceId);
  return runningEntries[0] ?? null;
}

export async function stopRunningEntriesByDevice(targetDeviceId: string): Promise<void> {
  const trimmedDeviceId = targetDeviceId.trim();
  if (!trimmedDeviceId) return;

  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const runningEntries = await timeEntries
      .query(Q.where('is_running', true), Q.where('running_device_id', trimmedDeviceId))
      .fetch();

    const endTime = Date.now();
    for (const entry of runningEntries) {
      let totalPausedDuration = entry.totalPausedDuration || 0;
      if (entry.isPaused && entry.pausedAt) {
        const currentPauseDuration = Math.floor((endTime - entry.pausedAt) / 1000);
        totalPausedDuration += currentPauseDuration;
      }
      const totalDuration = Math.floor((endTime - entry.startTime) / 1000);
      const duration = totalDuration - totalPausedDuration;

      await entry.update((e: TimeEntryModel) => {
        e.endTime = endTime;
        e.duration = duration;
        e.isRunning = false;
        e.isPaused = false;
        e.pausedAt = undefined;
        e.totalPausedDuration = totalPausedDuration;
        e.runningDeviceId = undefined;
        e.runningDeviceName = undefined;
        e.softLimitNotifiedAt = undefined;
      });
    }
  });
}

export async function emergencyStopLocalRunningEntries(): Promise<number> {
  const { deviceId } = await getCurrentDeviceContext();
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  return database.write(async () => {
    const runningEntries = await timeEntries.query(Q.where('is_running', true)).fetch();
    const stoppableEntries = runningEntries.filter((entry) => {
      const entryDeviceId = normalizeDeviceId(entry.runningDeviceId);
      if (normalizedDeviceId) {
        return entryDeviceId === normalizedDeviceId;
      }
      return entryDeviceId === null;
    });

    const endTime = Date.now();

    for (const entry of stoppableEntries) {
      let totalPausedDuration = entry.totalPausedDuration || 0;
      if (entry.isPaused && entry.pausedAt) {
        const currentPauseDuration = Math.floor((endTime - entry.pausedAt) / 1000);
        totalPausedDuration += currentPauseDuration;
      }

      const totalDuration = Math.floor((endTime - entry.startTime) / 1000);
      const duration = Math.max(0, totalDuration - totalPausedDuration);

      await entry.update((e: TimeEntryModel) => {
        e.endTime = endTime;
        e.duration = duration;
        e.isRunning = false;
        e.isPaused = false;
        e.pausedAt = undefined;
        e.totalPausedDuration = totalPausedDuration;
        e.runningDeviceId = undefined;
        e.runningDeviceName = undefined;
        e.softLimitNotifiedAt = undefined;
      });
    }

    return stoppableEntries.length;
  });
}

export function getTimeEntryHardLimitStopTime(
  entry: Pick<
    TimeEntryModel,
    | 'duration'
    | 'isRunning'
    | 'isPaused'
    | 'startTime'
    | 'pausedAt'
    | 'totalPausedDuration'
    | 'timerHardLimitMinutes'
  >,
  nowMs = Date.now(),
): number | null {
  const hardLimitMinutes = sanitizeTimerLimitMinutes(entry.timerHardLimitMinutes);
  if (!hardLimitMinutes) {
    return null;
  }

  const hardLimitSeconds = hardLimitMinutes * 60;
  const elapsedSeconds = getDisplayedTimeEntryDuration(entry, nowMs);
  if (elapsedSeconds < hardLimitSeconds) {
    return null;
  }

  if (entry.isPaused && entry.pausedAt) {
    return entry.pausedAt;
  }

  const overshootSeconds = elapsedSeconds - hardLimitSeconds;
  return Math.max(entry.startTime, nowMs - overshootSeconds * 1000);
}

export async function linkMissingTimesheetEntriesToPriceListItem(input: {
  timesheetId: string;
  priceListItemId: string;
  rate?: number;
  rateCurrency?: string;
}): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entries = await timeEntries
      .query(Q.where('timesheet_id', input.timesheetId), Q.where('price_list_item_id', null))
      .fetch();

    for (const entry of entries) {
      await entry.update((e: TimeEntryModel) => {
        e.priceListItemId = input.priceListItemId;
        if (input.rate !== undefined) {
          e.rate = input.rate;
          e.rateCurrency = normalizeCurrencyCode(input.rateCurrency, e.rateCurrency || 'CZK');
        }
      });
    }
  });
}

export async function linkTimesheetEntryToPriceListItem(input: {
  entryId: string;
  priceListItemId: string;
  rate?: number;
  rateCurrency?: string;
}): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(input.entryId);
    await entry.update((e: TimeEntryModel) => {
      e.priceListItemId = input.priceListItemId;
      if (input.rate !== undefined) {
        e.rate = input.rate;
        e.rateCurrency = normalizeCurrencyCode(input.rateCurrency, e.rateCurrency || 'CZK');
      }
    });
  });
}

export async function setTimesheetEntryRate(input: {
  entryId: string;
  rate: number;
  rateCurrency?: string;
  clearPriceListItemId?: boolean;
}): Promise<void> {
  const timeEntries = database.get<TimeEntryModel>(TimeEntryModel.table);

  await database.write(async () => {
    const entry = await timeEntries.find(input.entryId);
    await entry.update((e: TimeEntryModel) => {
      e.rate = input.rate;
      e.rateCurrency = normalizeCurrencyCode(input.rateCurrency, e.rateCurrency || 'CZK');
      if (input.clearPriceListItemId) {
        e.priceListItemId = undefined;
      }
    });
  });
}
