import database from '@/db';
import AppSettingsModel from '@/model/AppSettingsModel';
import {
  APP_SETTINGS_SINGLETON_ID,
  createDefaultAppSettingsDirtyRaw,
  mergeAppSettingsRecords,
  toAppSettingsRaw,
} from '@/repositories/app-settings-singleton';
import { sanitizeInvoiceDueDays } from '@/utils/invoice-defaults';
import { sanitizeTimerLimitMinutes } from '@/utils/timer-limit-utils';
import { sanitizeBillingIntervalMinutes } from '@/utils/time-utils';
import type { DirtyRaw, RawRecord as WMRawRecord } from '@nozbe/watermelondb/RawRecord';

export type UpdateSettingsInput = {
  language?: string;
  defaultBillingInterval?: number | null;
  timerSoftLimitEnabled?: boolean;
  timerSoftLimitMinutes?: number | null;
  timerHardLimitEnabled?: boolean;
  timerHardLimitMinutes?: number | null;
  defaultCompanyRegistry?: string | null;
  isVatPayer?: boolean;
  invoiceCompanyName?: string | null;
  invoiceAddress?: string | null;
  invoiceStreet2?: string | null;
  invoiceCity?: string | null;
  invoicePostalCode?: string | null;
  invoiceCountry?: string | null;
  invoiceCompanyId?: string | null;
  invoiceVatNumber?: string | null;
  invoiceRegistrationNote?: string | null;
  invoiceEmail?: string | null;
  invoicePhone?: string | null;
  invoiceWebsite?: string | null;
  invoiceBankAccount?: string | null;
  invoiceIban?: string | null;
  invoiceSwift?: string | null;
  invoiceLogoUri?: string | null;
  defaultInvoiceCurrency?: string | null;
  defaultInvoiceVatCodeId?: string | null;
  defaultInvoicePaymentMethod?: string | null;
  defaultInvoiceDueDays?: number | null;
  invoiceQrType?: string | null;
  invoiceDefaultExportFormat?: string | null;
  invoiceSeriesPrefix?: string | null;
  invoiceSeriesPattern?: string | null;
  invoiceSeriesNextNumber?: number | null;
  invoiceSeriesPadding?: number | null;
  invoiceSeriesPerDevice?: boolean;
  invoiceSeriesDeviceCode?: string | null;
  timesheetSeriesPrefix?: string | null;
  timesheetSeriesPattern?: string | null;
  timesheetSeriesNextNumber?: number | null;
  timesheetSeriesPadding?: number | null;
  timesheetSeriesPerDevice?: boolean;
  timesheetSeriesDeviceCode?: string | null;
  appLockEnabled?: boolean;
  appLockBiometricEnabled?: boolean;
};

/** Internal WatermelonDB model properties not exposed in public types */
interface ModelInternals {
  _raw: WMRawRecord;
  _setRaw: (key: string, value: unknown) => void;
}

export async function getSettings(): Promise<AppSettingsModel> {
  return ensureSingletonSettings();
}

async function ensureSingletonSettings(): Promise<AppSettingsModel> {
  const settingsCollection = database.get<AppSettingsModel>(AppSettingsModel.table);
  const allSettings = await settingsCollection.query().fetch();

  if (allSettings.length === 0) {
    return await database.write(async () => {
      const createdSettings = settingsCollection.prepareCreateFromDirtyRaw(
        createDefaultAppSettingsDirtyRaw() as DirtyRaw,
      );
      await database.batch(createdSettings);
      return createdSettings;
    });
  }

  if (allSettings.length === 1 && allSettings[0].id === APP_SETTINGS_SINGLETON_ID) {
    return allSettings[0];
  }

  return await database.write(async () => {
    const canonicalSettings = allSettings.find(
      (settings) => settings.id === APP_SETTINGS_SINGLETON_ID,
    );
    const mergedRaw = mergeAppSettingsRecords(
      allSettings.map((settings) => toAppSettingsRaw(settings as unknown as ModelInternals)),
      {
        status: canonicalSettings
          ? ((canonicalSettings as unknown as ModelInternals)._raw._status ?? 'updated')
          : 'created',
      },
    );

    const operations: AppSettingsModel[] = [];
    let resolvedSettings: AppSettingsModel;

    if (canonicalSettings) {
      operations.push(
        canonicalSettings.prepareUpdate((settings: AppSettingsModel) => {
          applyRawToSettings(settings, mergedRaw);
        }),
      );
      resolvedSettings = canonicalSettings;
    } else {
      const createdSettings = settingsCollection.prepareCreateFromDirtyRaw({
        ...mergedRaw,
        id: APP_SETTINGS_SINGLETON_ID,
        _status: 'created',
        _changed: '',
      } as DirtyRaw);
      operations.push(createdSettings);
      resolvedSettings = createdSettings;
    }

    for (const settings of allSettings) {
      if (settings.id === APP_SETTINGS_SINGLETON_ID) continue;
      operations.push(settings.prepareMarkAsDeleted());
    }

    await database.batch(...operations);
    return resolvedSettings;
  });
}

export async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  const settings = await getSettings();

  await database.write(async () => {
    await settings.update((s: AppSettingsModel) => {
      if (input.language !== undefined) s.language = input.language;
      if (input.defaultBillingInterval !== undefined) {
        s.defaultBillingInterval = sanitizeBillingIntervalMinutes(input.defaultBillingInterval);
      }
      if (input.timerSoftLimitEnabled !== undefined) {
        s.timerSoftLimitEnabled = input.timerSoftLimitEnabled;
      }
      if (input.timerSoftLimitMinutes !== undefined) {
        s.timerSoftLimitMinutes = sanitizeTimerLimitMinutes(input.timerSoftLimitMinutes);
      }
      if (input.timerHardLimitEnabled !== undefined) {
        s.timerHardLimitEnabled = input.timerHardLimitEnabled;
      }
      if (input.timerHardLimitMinutes !== undefined) {
        s.timerHardLimitMinutes = sanitizeTimerLimitMinutes(input.timerHardLimitMinutes);
      }
      if (input.defaultCompanyRegistry !== undefined) {
        s.defaultCompanyRegistry = input.defaultCompanyRegistry || undefined;
      }
      if (input.isVatPayer !== undefined) s.isVatPayer = input.isVatPayer;
      if (input.invoiceCompanyName !== undefined) {
        s.invoiceCompanyName = input.invoiceCompanyName || undefined;
      }
      if (input.invoiceAddress !== undefined) {
        s.invoiceAddress = input.invoiceAddress || undefined;
      }
      if (input.invoiceStreet2 !== undefined) {
        s.invoiceStreet2 = input.invoiceStreet2 || undefined;
      }
      if (input.invoiceCity !== undefined) {
        s.invoiceCity = input.invoiceCity || undefined;
      }
      if (input.invoicePostalCode !== undefined) {
        s.invoicePostalCode = input.invoicePostalCode || undefined;
      }
      if (input.invoiceCountry !== undefined) {
        s.invoiceCountry = input.invoiceCountry || undefined;
      }
      if (input.invoiceCompanyId !== undefined) {
        s.invoiceCompanyId = input.invoiceCompanyId || undefined;
      }
      if (input.invoiceVatNumber !== undefined) {
        s.invoiceVatNumber = input.invoiceVatNumber || undefined;
      }
      if (input.invoiceRegistrationNote !== undefined) {
        s.invoiceRegistrationNote = input.invoiceRegistrationNote || undefined;
      }
      if (input.invoiceEmail !== undefined) {
        s.invoiceEmail = input.invoiceEmail || undefined;
      }
      if (input.invoicePhone !== undefined) {
        s.invoicePhone = input.invoicePhone || undefined;
      }
      if (input.invoiceWebsite !== undefined) {
        s.invoiceWebsite = input.invoiceWebsite || undefined;
      }
      if (input.invoiceBankAccount !== undefined) {
        s.invoiceBankAccount = input.invoiceBankAccount || undefined;
      }
      if (input.invoiceIban !== undefined) {
        s.invoiceIban = input.invoiceIban || undefined;
      }
      if (input.invoiceSwift !== undefined) {
        s.invoiceSwift = input.invoiceSwift || undefined;
      }
      if (input.invoiceLogoUri !== undefined) {
        s.invoiceLogoUri = input.invoiceLogoUri || undefined;
      }
      if (input.defaultInvoiceCurrency !== undefined) {
        s.defaultInvoiceCurrency = input.defaultInvoiceCurrency || undefined;
      }
      if (input.defaultInvoiceVatCodeId !== undefined) {
        s.defaultInvoiceVatCodeId = input.defaultInvoiceVatCodeId || undefined;
      }
      if (input.defaultInvoicePaymentMethod !== undefined) {
        s.defaultInvoicePaymentMethod = input.defaultInvoicePaymentMethod || undefined;
      }
      if (input.defaultInvoiceDueDays !== undefined) {
        s.defaultInvoiceDueDays = sanitizeInvoiceDueDays(input.defaultInvoiceDueDays);
      }
      if (input.invoiceQrType !== undefined) {
        s.invoiceQrType = input.invoiceQrType || undefined;
      }
      if (input.invoiceDefaultExportFormat !== undefined) {
        s.invoiceDefaultExportFormat = input.invoiceDefaultExportFormat || undefined;
      }
      if (input.invoiceSeriesPrefix !== undefined) {
        s.invoiceSeriesPrefix = input.invoiceSeriesPrefix || undefined;
      }
      if (input.invoiceSeriesPattern !== undefined) {
        s.invoiceSeriesPattern = input.invoiceSeriesPattern || undefined;
      }
      if (input.invoiceSeriesNextNumber !== undefined) {
        s.invoiceSeriesNextNumber = input.invoiceSeriesNextNumber ?? undefined;
      }
      if (input.invoiceSeriesPadding !== undefined) {
        s.invoiceSeriesPadding = input.invoiceSeriesPadding ?? undefined;
      }
      if (input.invoiceSeriesPerDevice !== undefined) {
        s.invoiceSeriesPerDevice = input.invoiceSeriesPerDevice;
      }
      if (input.invoiceSeriesDeviceCode !== undefined) {
        s.invoiceSeriesDeviceCode = input.invoiceSeriesDeviceCode || undefined;
      }
      if (input.timesheetSeriesPrefix !== undefined) {
        s.timesheetSeriesPrefix = input.timesheetSeriesPrefix || undefined;
      }
      if (input.timesheetSeriesPattern !== undefined) {
        s.timesheetSeriesPattern = input.timesheetSeriesPattern || undefined;
      }
      if (input.timesheetSeriesNextNumber !== undefined) {
        s.timesheetSeriesNextNumber = input.timesheetSeriesNextNumber ?? undefined;
      }
      if (input.timesheetSeriesPadding !== undefined) {
        s.timesheetSeriesPadding = input.timesheetSeriesPadding ?? undefined;
      }
      if (input.timesheetSeriesPerDevice !== undefined) {
        s.timesheetSeriesPerDevice = input.timesheetSeriesPerDevice;
      }
      if (input.timesheetSeriesDeviceCode !== undefined) {
        s.timesheetSeriesDeviceCode = input.timesheetSeriesDeviceCode || undefined;
      }
      if (input.appLockEnabled !== undefined) {
        s.appLockEnabled = input.appLockEnabled;
      }
      if (input.appLockBiometricEnabled !== undefined) {
        s.appLockBiometricEnabled = input.appLockBiometricEnabled;
      }
    });
  });
}

export async function prepareAppSettingsForIncomingRemoteSync(): Promise<void> {
  await getSettings();

  const adapter = database.adapter as {
    unsafeExecute?: (commands: { sqls: [string, unknown[]][] }) => Promise<unknown>;
  };

  if (typeof adapter.unsafeExecute !== 'function') {
    return;
  }

  await adapter.unsafeExecute({
    sqls: [
      [
        `UPDATE "app_settings"
         SET "_status" = 'synced', "_changed" = ''
         WHERE "_status" != 'synced' OR "_changed" != ''`,
        [],
      ],
    ],
  });
}

function applyRawToSettings(settings: AppSettingsModel, raw: Record<string, unknown>): void {
  const internals = settings as unknown as ModelInternals;

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'id' || key === '_status' || key === '_changed') continue;
    internals._setRaw(key, value);
  }
}
