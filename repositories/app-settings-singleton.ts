import type { DirtyRaw, RawRecord as WMRawRecord } from '@nozbe/watermelondb/RawRecord';
import { DEFAULT_CURRENCY_CODE } from '@/utils/currency-utils';
import { DEFAULT_INVOICE_DUE_DAYS, DEFAULT_INVOICE_PAYMENT_METHOD } from '@/utils/invoice-defaults';
import {
  DEFAULT_TIMER_HARD_LIMIT_MINUTES,
  DEFAULT_TIMER_SOFT_LIMIT_MINUTES,
} from '@/utils/timer-limit-utils';

type AppSettingsDirtyRaw = DirtyRaw & Record<string, unknown>;
type AppSettingsRaw = WMRawRecord & Record<string, unknown>;

const APP_SETTINGS_DEFAULT_VALUES = {
  language: 'system',
  is_vat_payer: false,
  default_company_registry: 'none',
  timer_soft_limit_enabled: true,
  timer_soft_limit_minutes: DEFAULT_TIMER_SOFT_LIMIT_MINUTES,
  timer_hard_limit_enabled: true,
  timer_hard_limit_minutes: DEFAULT_TIMER_HARD_LIMIT_MINUTES,
  app_lock_enabled: false,
  app_lock_biometric_enabled: false,
  invoice_series_prefix: 'INV',
  default_invoice_currency: DEFAULT_CURRENCY_CODE,
  default_invoice_payment_method: DEFAULT_INVOICE_PAYMENT_METHOD,
  default_invoice_due_days: DEFAULT_INVOICE_DUE_DAYS,
  invoice_qr_type: 'none',
  invoice_default_export_format: 'none',
  invoice_series_pattern: 'YY####',
  invoice_series_next_number: 1,
  invoice_series_padding: 4,
  invoice_series_per_device: false,
  timesheet_series_prefix: 'TS',
  timesheet_series_pattern: 'TS-YY-####',
  timesheet_series_next_number: 1,
  timesheet_series_padding: 4,
  timesheet_series_per_device: false,
} as const;

const APP_SETTINGS_METADATA_KEYS = new Set(['id', '_status', '_changed']);

export const APP_SETTINGS_SINGLETON_ID = 'app-settings-singleton';

export function createDefaultAppSettingsDirtyRaw(
  overrides: Partial<AppSettingsDirtyRaw> = {},
  options?: {
    status?: DirtyRaw['_status'];
    timestamp?: number;
  },
): AppSettingsDirtyRaw {
  const timestamp = options?.timestamp ?? Date.now();

  return {
    id: APP_SETTINGS_SINGLETON_ID,
    _status: options?.status ?? 'created',
    _changed: '',
    ...APP_SETTINGS_DEFAULT_VALUES,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

export function mergeAppSettingsRecords(
  records: Record<string, unknown>[],
  options?: {
    status?: DirtyRaw['_status'];
    timestamp?: number;
  },
): AppSettingsDirtyRaw {
  const timestamp = options?.timestamp ?? Date.now();
  const validRecords = records.filter((record) => record && typeof record === 'object');
  const merged = createDefaultAppSettingsDirtyRaw(
    {},
    {
      status: options?.status ?? 'synced',
      timestamp,
    },
  );

  const orderedRecords = [...validRecords].sort((left, right) => {
    const leftUpdatedAt = getNumericTimestamp(left.updated_at);
    const rightUpdatedAt = getNumericTimestamp(right.updated_at);
    if (leftUpdatedAt !== rightUpdatedAt) {
      return leftUpdatedAt - rightUpdatedAt;
    }

    const leftCreatedAt = getNumericTimestamp(left.created_at);
    const rightCreatedAt = getNumericTimestamp(right.created_at);
    return leftCreatedAt - rightCreatedAt;
  });

  for (const record of orderedRecords) {
    for (const [key, value] of Object.entries(record)) {
      if (APP_SETTINGS_METADATA_KEYS.has(key)) continue;
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }

  const createdAtValues = orderedRecords
    .map((record) => getNumericTimestamp(record.created_at))
    .filter((value) => value > 0);
  const updatedAtValues = orderedRecords
    .map((record) => getNumericTimestamp(record.updated_at))
    .filter((value) => value > 0);

  merged.id = APP_SETTINGS_SINGLETON_ID;
  merged.created_at = createdAtValues.length > 0 ? Math.min(...createdAtValues) : timestamp;
  merged.updated_at = updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : timestamp;

  return merged;
}

export function normalizeAppSettingsRecords(
  records: Record<string, unknown>[],
  options?: {
    status?: DirtyRaw['_status'];
    timestamp?: number;
  },
): AppSettingsDirtyRaw[] {
  if (!records || records.length === 0) {
    return [];
  }

  return [mergeAppSettingsRecords(records, options)];
}

export function toAppSettingsRaw(record: { _raw: WMRawRecord }): AppSettingsRaw {
  return { ...record._raw };
}

function getNumericTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
