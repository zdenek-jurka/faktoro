import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { GroupedListRow } from '@/components/ui/grouped-list';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { OptionSheetModal } from '@/components/ui/option-sheet-modal';
import { isPdfOpenEnabled, isPdfSaveEnabled } from '@/constants/features';
import { Colors } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { getIntlLocale, normalizeIntlLocale, normalizeLocale } from '@/i18n/locale-options';
import type { Locales } from '@/i18n/i18n-types';
import { i18nObject } from '@/i18n/i18n-util';
import {
  ClientModel,
  InvoiceItemModel,
  InvoiceModel,
  TimeEntryModel,
  TimesheetModel,
} from '@/model';
import { getSuggestedInvoiceNumber } from '@/repositories/invoice-repository';
import { getSettings } from '@/repositories/settings-repository';
import { TimesheetPreset } from '@/repositories/timesheet-repository';
import { getDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice, formatPriceValue } from '@/utils/price-utils';
import {
  getErrorMessage,
  getExportIntegrationErrorMessage,
  getRawErrorMessage,
  isHttpError,
  isNetworkError,
} from '@/utils/error-utils';
import {
  addDaysToIsoDate,
  resolveInvoiceDueDays,
  resolveInvoicePaymentMethod,
} from '@/utils/invoice-defaults';
import { buildCopyFileName } from '@/utils/file-name-utils';
import { openLocalFile } from '@/utils/open-local-file';
import { buildPdfLogoHtml } from '@/utils/pdf-logo';
import { printHtmlToPdfCacheFile } from '@/utils/pdf-export-file';
import { isIos } from '@/utils/platform';
import {
  type ExportIntegration,
  deliverIntegrationResult,
  getExportIntegrations,
  transformExportXml,
  validateBaseExportXml,
} from '@/repositories/export-integration-repository';
import { getConfigValue, setConfigValue } from '@/repositories/config-storage-repository';
import { buildTimesheetXml } from '@/templates/timesheet/xml';
import { observeBetaSettings } from '@/repositories/beta-settings-repository';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Pressable, View } from 'react-native';

const LAST_TIMESHEET_EXPORT_ACTION_KEY = 'timesheet_export.last_action';

type LastTimesheetExportAction =
  | 'pdf'
  | 'open_pdf'
  | 'save_pdf'
  | 'xlsx'
  | 'xml_base'
  | `integration:${string}`;

type PendingTimesheetExportSheetAction =
  | 'pdf'
  | 'open_pdf'
  | 'save_pdf'
  | 'xlsx'
  | 'xml_base'
  | `integration:${string}`
  | null;

type TimesheetPdfExportResult = {
  fileName: string;
  uri: string;
};

type TimesheetExportRow = {
  activity: string;
  start: string;
  end: string;
  duration: string;
  sourceDevice?: string;
  rate?: number;
  currency?: string;
  amount?: number;
};

type BillingTotal = {
  currency: string;
  amount: number;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function TimesheetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const entriesContentStyle = useBottomSafeAreaStyle(styles.entriesContent);

  const [timesheet, setTimesheet] = useState<TimesheetModel | null>(null);
  const [client, setClient] = useState<ClientModel | null>(null);
  const [entries, setEntries] = useState<TimeEntryModel[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingXml, setIsExportingXml] = useState(false);
  const [isExportSheetVisible, setIsExportSheetVisible] = useState(false);
  const [isXmlExportSheetVisible, setIsXmlExportSheetVisible] = useState(false);
  const [pendingExportSheetAction, setPendingExportSheetAction] =
    useState<PendingTimesheetExportSheetAction>(null);
  const [exportIntegrationsEnabled, setExportIntegrationsEnabled] = useState(false);
  const [timesheetExportIntegrations, setTimesheetExportIntegrations] = useState<
    ExportIntegration[]
  >([]);
  const [lastExportAction, setLastExportAction] = useState<LastTimesheetExportAction | null>(null);
  const [isPreparingInvoice, setIsPreparingInvoice] = useState(false);
  const [isTimesheetLinkedToInvoice, setIsTimesheetLinkedToInvoice] = useState(false);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [linkedInvoiceNumber, setLinkedInvoiceNumber] = useState<string | null>(null);
  const exportLocale = useMemo<Locales>(
    () => normalizeLocale(client?.exportLanguage, locale),
    [client?.exportLanguage, locale],
  );
  const LLExport = useMemo(() => i18nObject(exportLocale), [exportLocale]);
  const exportDateLocale = useMemo(() => getIntlLocale(exportLocale), [exportLocale]);

  useEffect(() => {
    const unsub = observeBetaSettings((settings) => {
      setExportIntegrationsEnabled(settings.exportIntegrationsEnabled);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadLastExportAction = async () => {
      const stored = await getConfigValue(LAST_TIMESHEET_EXPORT_ACTION_KEY);
      if (!isMounted) return;
      setLastExportAction(stored ? (stored as LastTimesheetExportAction) : null);
    };

    void loadLastExportAction();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const loadIntegrations = async () => {
      if (!exportIntegrationsEnabled) {
        setTimesheetExportIntegrations([]);
        return;
      }
      const integrations = await getExportIntegrations('timesheet');
      setTimesheetExportIntegrations(integrations);
    };
    void loadIntegrations();
  }, [exportIntegrationsEnabled]);

  useEffect(() => {
    if (!id) return;

    const timesheetSubscription = database
      .get<TimesheetModel>(TimesheetModel.table)
      .findAndObserve(id)
      .subscribe((value) => {
        setTimesheet(value);
      });

    const entriesSubscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', id), Q.sortBy('start_time', Q.desc))
      .observeWithColumns([
        'timesheet_id',
        'client_id',
        'description',
        'start_time',
        'end_time',
        'duration',
        'timesheet_duration',
        'is_running',
        'is_paused',
        'paused_at',
        'total_paused_duration',
        'source_device_id',
        'source_device_name',
        'price_list_item_id',
        'rate',
        'rate_currency',
      ])
      .subscribe(setEntries);

    return () => {
      timesheetSubscription.unsubscribe();
      entriesSubscription.unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    if (!timesheet?.clientId) {
      setClient(null);
      return;
    }

    const clientSubscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(timesheet.clientId)
      .subscribe(setClient);

    return () => clientSubscription.unsubscribe();
  }, [timesheet?.clientId]);

  useEffect(() => {
    if (!timesheet?.id) {
      setIsTimesheetLinkedToInvoice(false);
      return;
    }

    const subscription = database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('source_kind', 'timesheet'), Q.where('source_id', timesheet.id))
      .observeWithColumns(['source_kind', 'source_id', 'invoice_id'])
      .subscribe((items) => {
        const first = items[0];
        const invoiceId = first?.invoiceId || null;
        setLinkedInvoiceId(invoiceId);
        setIsTimesheetLinkedToInvoice(!!invoiceId);
      });

    return () => subscription.unsubscribe();
  }, [timesheet?.id]);

  useEffect(() => {
    if (!linkedInvoiceId) {
      setLinkedInvoiceNumber(null);
      return;
    }

    const subscription = database
      .get<InvoiceModel>(InvoiceModel.table)
      .findAndObserve(linkedInvoiceId)
      .subscribe((invoice) => {
        setLinkedInvoiceNumber(invoice.invoiceNumber?.trim() || invoice.id);
      });

    return () => subscription.unsubscribe();
  }, [linkedInvoiceId]);

  const runPendingExportSheetAction = useEffectEvent(() => {
    const action = pendingExportSheetAction;
    if (action === null) {
      return;
    }

    if (action === 'pdf') {
      setPendingExportSheetAction(null);
      void handleExportPdf();
      return;
    }
    if (action === 'open_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfOpenEnabled) {
        void handleOpenPdf();
      }
      return;
    }
    if (action === 'save_pdf') {
      setPendingExportSheetAction(null);
      if (isPdfSaveEnabled) {
        void handleSavePdf();
      }
      return;
    }
    if (action === 'xlsx') {
      setPendingExportSheetAction(null);
      void handleExportXlsx();
      return;
    }
    if (action === 'xml_base') {
      setPendingExportSheetAction(null);
      void doExportXml(null);
      return;
    }
    if (action.startsWith('integration:')) {
      const integrationId = action.slice('integration:'.length);
      setPendingExportSheetAction(null);
      void doExportXml(integrationId);
    }
  });

  useEffect(() => {
    if (isExportSheetVisible || isXmlExportSheetVisible || pendingExportSheetAction === null) {
      return;
    }

    const timeoutId = setTimeout(() => {
      runPendingExportSheetAction();
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [
    isExportSheetVisible,
    isXmlExportSheetVisible,
    pendingExportSheetAction,
    runPendingExportSheetAction,
  ]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(intlLocale);
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString(intlLocale)} ${date.toLocaleTimeString(intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  const getPeriodLabel = (
    periodType: string | undefined,
    sourceLL: ReturnType<typeof useI18nContext>['LL'],
  ): string => {
    switch (periodType as TimesheetPreset | undefined) {
      case 'all':
        return sourceLL.timesheets.periodAll();
      case 'this_month':
        return sourceLL.timesheets.periodThisMonth();
      case 'last_month':
        return sourceLL.timesheets.periodLastMonth();
      case 'this_quarter':
        return sourceLL.timesheets.periodThisQuarter();
      case 'last_quarter':
        return sourceLL.timesheets.periodLastQuarter();
      case 'this_year':
        return sourceLL.timesheets.periodThisYear();
      case 'last_year':
        return sourceLL.timesheets.periodLastYear();
      case 'this_week':
        return sourceLL.timesheets.periodThisWeek();
      case 'last_week':
        return sourceLL.timesheets.periodLastWeek();
      case 'last_7_days':
        return sourceLL.timesheets.periodLast7Days();
      case 'custom':
      default:
        return sourceLL.timesheets.periodCustom();
    }
  };

  const getTimesheetTitle = (
    sourceTimesheet: TimesheetModel | null,
    sourceLL: ReturnType<typeof useI18nContext>['LL'],
  ): string => {
    if (!sourceTimesheet) return sourceLL.timesheets.detailTitle();
    return (
      sourceTimesheet.timesheetNumber?.trim() ||
      sourceTimesheet.label?.trim() ||
      getPeriodLabel(sourceTimesheet.periodType, sourceLL)
    );
  };

  const getTimesheetSubtitle = (
    sourceTimesheet: TimesheetModel | null,
    sourceLL: ReturnType<typeof useI18nContext>['LL'],
  ): string | undefined => {
    if (!sourceTimesheet?.timesheetNumber?.trim()) return undefined;
    return sourceTimesheet.label?.trim() || getPeriodLabel(sourceTimesheet.periodType, sourceLL);
  };

  const totalDuration = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.timesheetDuration ?? entry.duration ?? 0), 0),
    [entries],
  );

  const sanitizeFilenamePart = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();

  const getExportFilenameBase = (): string => {
    const numberPart = sanitizeFilenamePart(timesheet?.timesheetNumber || '');
    if (numberPart) {
      return `timesheet_${numberPart}`;
    }
    const clientName = sanitizeFilenamePart(client?.name || 'client');
    const from = timesheet ? new Date(timesheet.periodFrom).toISOString().slice(0, 10) : 'from';
    const to = timesheet ? new Date(timesheet.periodTo).toISOString().slice(0, 10) : 'to';
    return `timesheet_${clientName}_${from}_${to}`;
  };

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const formatExportDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(exportDateLocale);
  };

  const formatExportDateTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString(exportDateLocale)} ${date.toLocaleTimeString(
      exportDateLocale,
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    )}`;
  };

  const shouldIncludeSourceDeviceInExport = async (): Promise<boolean> => {
    const settings = await getDeviceSyncSettings();
    return settings.syncIsRegistered;
  };

  const getEntrySourceDeviceLabel = (entry: TimeEntryModel): string => {
    return (
      entry.sourceDeviceName?.trim() ||
      entry.sourceDeviceId?.trim() ||
      entry.runningDeviceName?.trim() ||
      entry.runningDeviceId?.trim() ||
      LLExport.timeTracking.unknownDevice()
    );
  };

  const buildExportRows = (includeSourceDevice: boolean): TimesheetExportRow[] =>
    entries.map((entry) => {
      const durationSeconds = entry.timesheetDuration ?? entry.duration ?? 0;
      const rate = entry.rate;
      const hasRate = rate != null && Number.isFinite(rate);
      const currency = hasRate ? normalizeCurrencyCode(entry.rateCurrency) : undefined;
      const amount = hasRate ? (durationSeconds / 3600) * rate : undefined;

      return {
        activity: entry.description?.trim() || '-',
        start: formatExportDateTime(entry.startTime),
        end: entry.endTime ? formatExportDateTime(entry.endTime) : '-',
        duration: formatDuration(durationSeconds),
        sourceDevice: includeSourceDevice ? getEntrySourceDeviceLabel(entry) : undefined,
        rate: hasRate ? rate : undefined,
        currency,
        amount: amount != null && Number.isFinite(amount) ? amount : undefined,
      };
    });

  const shouldIncludeBillingInExport = (rows: TimesheetExportRow[]): boolean => {
    return rows.some((row) => row.rate != null);
  };

  const getBillingTotals = (rows: TimesheetExportRow[]): BillingTotal[] => {
    const totalsByCurrency = new Map<string, number>();

    for (const row of rows) {
      if (row.amount == null || !row.currency) continue;
      totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.amount);
    }

    return Array.from(totalsByCurrency.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
  };

  const countUnpricedRows = (rows: TimesheetExportRow[]): number => {
    return rows.filter((row) => row.rate == null).length;
  };

  const formatBillingAmount = (amount: number, currency: string): string => {
    return formatPrice(amount, currency, exportDateLocale);
  };

  const formatBillingNumber = (amount: number): string => {
    return formatPriceValue(amount, exportDateLocale);
  };

  const roundExportAmount = (amount: number): number => Number(amount.toFixed(2));

  const rememberLastExportAction = async (action: LastTimesheetExportAction) => {
    setLastExportAction(action);
    await setConfigValue(LAST_TIMESHEET_EXPORT_ACTION_KEY, action);
  };

  const exportTimesheetPdf = async (prebuiltPdfFile?: TimesheetPdfExportResult) => {
    if (!timesheet) return;

    try {
      setIsExportingPdf(true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      const pdfFile = prebuiltPdfFile ?? (await buildTimesheetPdfFile());

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.timesheets.exportShareUnavailable());
        return;
      }

      await Sharing.shareAsync(pdfFile.uri, {
        mimeType: 'application/pdf',
        dialogTitle: LLExport.timesheets.exportShareTitle(),
      });
      await rememberLastExportAction('pdf');
    } catch (error) {
      const message = getErrorMessage(error, LLExport.timesheets.exportErrorPdf());
      Alert.alert(LLExport.common.error(), `${LLExport.timesheets.exportErrorPdf()}\n${message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportPdf = async () => {
    await exportTimesheetPdf();
  };

  const showOpenPdfFallback = (pdfFile: TimesheetPdfExportResult) => {
    const fallbackOptions = [
      { text: LL.common.cancel(), style: 'cancel' as const },
      ...(isPdfSaveEnabled
        ? [
            {
              text: LL.timesheets.savePdf(),
              onPress: () => {
                void saveTimesheetPdf(pdfFile);
              },
            },
          ]
        : []),
      {
        text: LL.timesheets.exportPdf(),
        onPress: () => {
          void exportTimesheetPdf(pdfFile);
        },
      },
    ];

    Alert.alert(
      LLExport.timesheets.openPdfUnavailableTitle(),
      LLExport.timesheets.openPdfUnavailableMessage(),
      fallbackOptions,
    );
  };

  const handleOpenPdf = async () => {
    if (!timesheet) return;

    let pdfFile: TimesheetPdfExportResult | null = null;
    try {
      setIsOpeningPdf(true);
      pdfFile = await buildTimesheetPdfFile();
      await openLocalFile(pdfFile.uri);
      await rememberLastExportAction('open_pdf');
    } catch (error) {
      if (pdfFile) {
        showOpenPdfFallback(pdfFile);
      } else {
        Alert.alert(
          LLExport.common.error(),
          getErrorMessage(error, LLExport.timesheets.openPdfError()),
        );
      }
    } finally {
      setIsOpeningPdf(false);
    }
  };

  const buildTimesheetPdfFile = async (): Promise<TimesheetPdfExportResult> => {
    if (!timesheet) {
      throw new Error(LLExport.timesheets.savePdfError());
    }

    const includeSourceDevice = await shouldIncludeSourceDeviceInExport();
    const rows = buildExportRows(includeSourceDevice);
    const includeBilling = shouldIncludeBillingInExport(rows);
    const billingTotals = getBillingTotals(rows);
    const unpricedRowsCount = countUnpricedRows(rows);
    const htmlRows = rows
      .map((row) => {
        const sourceDeviceCellHtml = includeSourceDevice
          ? `<td class="source-column">${escapeHtml(row.sourceDevice || LLExport.timeTracking.unknownDevice())}</td>`
          : '';
        const billingCellHtml = includeBilling
          ? `
            <td class="money-column">${escapeHtml(row.rate != null ? formatBillingNumber(row.rate) : '-')}</td>
            <td class="currency-column">${escapeHtml(row.currency || '-')}</td>
            <td class="money-column">${escapeHtml(row.amount != null ? formatBillingNumber(row.amount) : '-')}</td>
          `
          : '';

        return `
          <tr>
            <td>${escapeHtml(row.activity)}</td>
            <td class="date-column">${escapeHtml(row.start)}</td>
            <td class="date-column">${escapeHtml(row.end)}</td>
            ${sourceDeviceCellHtml}
            <td class="duration-column">${escapeHtml(row.duration)}</td>
            ${billingCellHtml}
          </tr>
        `;
      })
      .join('');
    const sourceDeviceHeaderHtml = includeSourceDevice
      ? `<th class="source-column">${escapeHtml(LLExport.timesheets.sourceDeviceLabel())}</th>`
      : '';
    const billingHeaderHtml = includeBilling
      ? `
        <th class="money-column">${escapeHtml(LLExport.timeTracking.manualRate())}</th>
        <th class="currency-column">${escapeHtml(LLExport.timeTracking.rateCurrency())}</th>
        <th class="money-column">${escapeHtml(LLExport.timesheets.amountLabel())}</th>
      `
      : '';
    const billingTotalsText =
      billingTotals.length > 0
        ? billingTotals
            .map((total) => formatBillingAmount(total.amount, total.currency))
            .join(' • ')
        : '';
    const exportBodyColor = Colors.light.text;
    const exportMetaColor = Colors.light.textSecondary;
    const exportBorderColor = Colors.light.border;
    const exportHeaderBackground = Colors.light.backgroundSubtle;
    const exportTitle = getTimesheetTitle(timesheet, LLExport);
    const exportSubtitle = getTimesheetSubtitle(timesheet, LLExport);
    const settings = await getSettings();
    const logoHtml = await buildPdfLogoHtml({
      logoUri: settings.invoiceLogoUri,
      logoBase64: settings.invoiceLogoBase64,
      logoMimeType: settings.invoiceLogoMimeType,
    });

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: ${exportBodyColor}; }
            .header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom: 16px; }
            .header-main { flex: 1; min-width: 0; }
            .logo-box { text-align:right; min-width: 180px; }
            h1 { margin: 0 0 8px; font-size: 20px; }
            .meta { margin: 2px 0; color: ${exportMetaColor}; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid ${exportBorderColor}; padding: 8px 6px; font-size: ${includeBilling ? '10px' : '12px'}; }
            th { text-align: left; background: ${exportHeaderBackground}; }
            .date-column { white-space: nowrap; width: ${includeBilling ? '13%' : '18%'}; }
            .source-column { width: ${includeBilling ? '12%' : '18%'}; }
            .duration-column { text-align: right; white-space: nowrap; width: ${includeBilling ? '9%' : '12%'}; }
            .money-column { text-align: right; white-space: nowrap; width: 11%; }
            .currency-column { white-space: nowrap; width: 7%; }
            .notice { margin-top: 8px; color: ${exportMetaColor}; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-main">
              <h1>${escapeHtml(exportTitle)}</h1>
              ${exportSubtitle ? `<div class="meta">${escapeHtml(exportSubtitle)}</div>` : ''}
              <div class="meta">${escapeHtml(LLExport.timesheets.clientLabel())}: ${escapeHtml(client?.name || '-')}</div>
              <div class="meta">${escapeHtml(LLExport.timesheets.periodLabel())}: ${escapeHtml(`${formatExportDate(timesheet.periodFrom)} - ${formatExportDate(timesheet.periodTo)}`)}</div>
              <div class="meta">${escapeHtml(
                `${LLExport.timesheets.entriesCount({ count: entries.length })} • ${LLExport.timesheets.totalDurationLabel()}: ${formatDuration(totalDuration)}`,
              )}</div>
              ${
                billingTotalsText
                  ? `<div class="meta">${escapeHtml(LLExport.timesheets.billingTotalLabel())}: ${escapeHtml(billingTotalsText)}</div>`
                  : ''
              }
            </div>
            ${logoHtml ? `<div class="logo-box">${logoHtml}</div>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(LLExport.timeTracking.activity())}</th>
                <th class="date-column">${escapeHtml(LLExport.timesheets.startLabel())}</th>
                <th class="date-column">${escapeHtml(LLExport.timeTracking.endTime())}</th>
                ${sourceDeviceHeaderHtml}
                <th class="duration-column">${escapeHtml(LLExport.timesheets.durationLabel())}</th>
                ${billingHeaderHtml}
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
          ${
            includeBilling && unpricedRowsCount > 0
              ? `<div class="notice">${escapeHtml(LLExport.timesheets.unpricedEntriesNotice())}</div>`
              : ''
          }
        </body>
      </html>
    `;

    return printHtmlToPdfCacheFile({
      html,
      fileName: `${getExportFilenameBase()}.pdf`,
      errorMessage: LLExport.timesheets.savePdfError(),
    });
  };

  const saveTimesheetPdf = async (prebuiltPdfFile?: TimesheetPdfExportResult) => {
    if (!timesheet) return;

    try {
      setIsSavingPdf(true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const initialPdfFile = prebuiltPdfFile ?? (isIos ? await buildTimesheetPdfFile() : null);
      const pickedDirectory = await FileSystem.Directory.pickDirectoryAsync();
      if (isIos) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const pdfFile = initialPdfFile ?? (await buildTimesheetPdfFile());
      const sourceFile = new FileSystem.File(pdfFile.uri);
      const existingEntries = pickedDirectory.list();
      const existingEntry = existingEntries.find(
        (entry: InstanceType<typeof FileSystem.File> | InstanceType<typeof FileSystem.Directory>) =>
          entry.name === pdfFile.fileName,
      );

      let targetFileName = pdfFile.fileName;
      if (existingEntry) {
        if (existingEntry instanceof FileSystem.Directory) {
          throw new Error(LLExport.timesheets.savePdfNameConflictFolder());
        }

        const existingNames = new Set(existingEntries.map((entry) => entry.name));
        const copyFileName = buildCopyFileName(pdfFile.fileName, existingNames);
        const selectedFileName = await new Promise<string | null>((resolve) => {
          Alert.alert(
            LLExport.timesheets.savePdfExistsTitle(),
            LLExport.timesheets.savePdfExistsMessage({ fileName: pdfFile.fileName }),
            [
              {
                text: LL.common.cancel(),
                style: 'cancel',
                onPress: () => resolve(null),
              },
              {
                text: LLExport.timesheets.savePdfSaveCopy(),
                onPress: () => resolve(copyFileName),
              },
              {
                text: LLExport.timesheets.savePdfReplace(),
                style: 'destructive',
                onPress: () => resolve(pdfFile.fileName),
              },
            ],
            {
              cancelable: true,
              onDismiss: () => resolve(null),
            },
          );
        });

        if (!selectedFileName) {
          return;
        }

        targetFileName = selectedFileName;

        if (targetFileName === pdfFile.fileName) {
          existingEntry.delete();
        }
      }

      const targetFile = pickedDirectory.createFile(targetFileName, 'application/pdf');
      targetFile.write(await sourceFile.bytes());

      Alert.alert(
        LLExport.common.success(),
        LLExport.timesheets.savePdfSuccess({ fileName: targetFileName }),
      );
      await rememberLastExportAction('save_pdf');
    } catch (error) {
      const rawMessage = getRawErrorMessage(error);
      if (rawMessage && /cancel(?:ed|led)/i.test(rawMessage)) {
        return;
      }
      Alert.alert(
        LLExport.common.error(),
        getErrorMessage(error, LLExport.timesheets.savePdfError()),
      );
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleSavePdf = async () => {
    await saveTimesheetPdf();
  };

  const handleExportXlsx = async () => {
    if (!timesheet) return;

    try {
      setIsExportingXlsx(true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');

      const includeSourceDevice = await shouldIncludeSourceDeviceInExport();
      const exportRows = buildExportRows(includeSourceDevice);
      const includeBilling = shouldIncludeBillingInExport(exportRows);
      const billingTotals = getBillingTotals(exportRows);
      const unpricedRowsCount = countUnpricedRows(exportRows);
      const headers = [
        LLExport.timeTracking.activity(),
        LLExport.timesheets.startLabel(),
        LLExport.timeTracking.endTime(),
        ...(includeSourceDevice ? [LLExport.timesheets.sourceDeviceLabel()] : []),
        LLExport.timesheets.durationLabel(),
        ...(includeBilling
          ? [
              LLExport.timeTracking.manualRate(),
              LLExport.timeTracking.rateCurrency(),
              LLExport.timesheets.amountLabel(),
            ]
          : []),
      ];
      const amountColumnIndex = headers.length - 1;
      const rows = exportRows.map((row) => [
        row.activity,
        row.start,
        row.end,
        ...(includeSourceDevice ? [row.sourceDevice || LLExport.timeTracking.unknownDevice()] : []),
        row.duration,
        ...(includeBilling
          ? [
              row.rate != null ? roundExportAmount(row.rate) : '',
              row.currency || '',
              row.amount != null ? roundExportAmount(row.amount) : '',
            ]
          : []),
      ]);
      const sheetRows: unknown[][] = [headers, ...rows];

      if (includeBilling) {
        sheetRows.push([]);
        for (const total of billingTotals) {
          const totalRow = new Array(headers.length).fill('');
          totalRow[0] = `${LLExport.timesheets.billingTotalLabel()} ${total.currency}`;
          totalRow[amountColumnIndex] = roundExportAmount(total.amount);
          sheetRows.push(totalRow);
        }
        if (unpricedRowsCount > 0) {
          sheetRows.push([LLExport.timesheets.unpricedEntriesNotice()]);
        }
      }

      const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
      sheet['!cols'] = headers.map((header) => ({
        wch:
          header === LLExport.timeTracking.activity()
            ? 34
            : header === LLExport.timesheets.startLabel() ||
                header === LLExport.timeTracking.endTime()
              ? 18
              : 16,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, LLExport.timesheets.title());

      const xlsxBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
      if (!cacheDirectory) {
        throw new Error('Missing cache directory');
      }
      const targetUri = `${cacheDirectory}${getExportFilenameBase()}.xlsx`;

      await FileSystemLegacy.writeAsStringAsync(targetUri, xlsxBase64, {
        encoding: FileSystemLegacy.EncodingType?.Base64 ?? 'base64',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.timesheets.exportShareUnavailable());
        return;
      }

      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: LLExport.timesheets.exportShareTitle(),
      });
      await rememberLastExportAction('xlsx');
    } catch (error) {
      const message = getErrorMessage(error, LLExport.timesheets.exportErrorXlsx());
      Alert.alert(LLExport.common.error(), `${LLExport.timesheets.exportErrorXlsx()}\n${message}`);
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportXml = async () => {
    if (!timesheet) return;
    setIsXmlExportSheetVisible(true);
  };

  const doExportXml = async (integrationId: string | null) => {
    if (!timesheet) return;

    try {
      setIsExportingXml(true);
      const xmlContent = buildTimesheetXml({ timesheet, client, entries });
      validateBaseExportXml('timesheet', xmlContent);
      const filename = `${getExportFilenameBase()}.xml`;

      if (integrationId) {
        const integrations = await getExportIntegrations();
        const integration = integrations.find((i) => i.id === integrationId);
        if (!integration) throw new Error('Integration not found');

        const transformed = await transformExportXml('timesheet', xmlContent, integration.xslt);

        const result = await deliverIntegrationResult(integration, transformed, filename);
        if (result.outcome === 'copied') {
          Alert.alert(LLExport.common.success(), LLExport.timesheets.exportClipboardSuccess());
        } else if (result.outcome === 'sent') {
          Alert.alert(
            LLExport.common.success(),
            LLExport.timesheets.exportWebhookSuccess({ status: result.status }),
          );
        }
        // 'shared' outcome: system share sheet handles UI
        await rememberLastExportAction(`integration:${integration.id}`);
        return;
      }

      // Base XML — share as file
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystemLegacy = require('expo-file-system/legacy');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');

      const cacheDirectory: string | undefined = FileSystemLegacy.cacheDirectory;
      if (!cacheDirectory) throw new Error('Missing cache directory');

      const targetUri = `${cacheDirectory}${filename}`;
      await FileSystemLegacy.writeAsStringAsync(targetUri, xmlContent, {
        encoding: FileSystemLegacy.EncodingType?.UTF8 ?? 'utf8',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(LLExport.common.error(), LLExport.timesheets.exportShareUnavailable());
        return;
      }

      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/xml',
        dialogTitle: LLExport.timesheets.exportShareTitle(),
      });
      await rememberLastExportAction('xml_base');
    } catch (error) {
      const message = isHttpError(error)
        ? LLExport.timesheets.exportWebhookError({
            status: error.httpStatus,
          })
        : isNetworkError(error)
          ? LLExport.timesheets.exportWebhookNetworkError()
          : getExportIntegrationErrorMessage(
              error,
              LLExport,
              getErrorMessage(error, LLExport.timesheets.exportErrorXml()),
            );
      Alert.alert(LLExport.common.error(), message);
    } finally {
      setIsExportingXml(false);
    }
  };

  const handleCreateInvoiceFromTimesheet = async () => {
    if (!timesheet || !client) return;
    if (isTimesheetLinkedToInvoice && linkedInvoiceId) {
      router.push(`/invoices/${linkedInvoiceId}`);
      return;
    }
    if (entries.length === 0) {
      Alert.alert(LL.common.error(), LL.invoices.errorNoItems());
      return;
    }

    try {
      setIsPreparingInvoice(true);
      const invoiceNumber = await getSuggestedInvoiceNumber();
      const settings = await getSettings();
      const today = new Date().toISOString().slice(0, 10);
      const dueDate = addDaysToIsoDate(today, resolveInvoiceDueDays(client, settings));
      router.push({
        pathname: '/invoices/new',
        params: {
          headerDraft: JSON.stringify({
            clientId: client.id,
            invoiceNumber,
            issuedDate: today,
            taxableDate: today,
            dueDate,
            currency: normalizeCurrencyCode(settings.defaultInvoiceCurrency),
            paymentMethod: resolveInvoicePaymentMethod(client, settings),
          }),
          preselectedTimesheetId: timesheet.id,
          autoOpenTimesheetImport: '1',
          itemsDraft: JSON.stringify([]),
        },
      });
    } catch (error) {
      const message = getErrorMessage(error, LL.common.error());
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsPreparingInvoice(false);
    }
  };

  const isAnyExporting =
    isExportingPdf || isOpeningPdf || isSavingPdf || isExportingXlsx || isExportingXml;

  const recommendedExport = (() => {
    if (!lastExportAction) return null;

    if (lastExportAction === 'pdf') {
      return {
        label: LL.timesheets.exportPdf(),
        onPress: () => void handleExportPdf(),
      };
    }

    if (lastExportAction === 'open_pdf' && isPdfOpenEnabled) {
      return {
        label: LL.timesheets.openPdf(),
        onPress: () => void handleOpenPdf(),
      };
    }

    if (lastExportAction === 'save_pdf' && isPdfSaveEnabled) {
      return {
        label: LL.timesheets.savePdf(),
        onPress: () => void handleSavePdf(),
      };
    }

    if (lastExportAction === 'xlsx') {
      return {
        label: LL.timesheets.exportXlsx(),
        onPress: () => void handleExportXlsx(),
      };
    }

    if (lastExportAction === 'xml_base') {
      return {
        label: LLExport.timesheets.exportBaseXmlOption(),
        onPress: () => void doExportXml(null),
      };
    }

    if (lastExportAction.startsWith('integration:')) {
      const integrationId = lastExportAction.slice('integration:'.length);
      const integration = timesheetExportIntegrations.find((item) => item.id === integrationId);
      if (!integration) return null;
      return {
        label: integration.name,
        onPress: () => void doExportXml(integration.id),
      };
    }

    return null;
  })();

  const primaryExportAction = recommendedExport
    ? recommendedExport
    : {
        label: exportIntegrationsEnabled
          ? LL.timesheets.exportActionWithXml()
          : LL.timesheets.exportAction(),
        onPress: () => setIsExportSheetVisible(true),
      };

  const queueExportSheetAction = (action: Exclude<PendingTimesheetExportSheetAction, null>) => {
    setPendingExportSheetAction(action);
    setIsExportSheetVisible(false);
    setIsXmlExportSheetVisible(false);
  };

  const handleOpenDeleteFlow = () => {
    if (!timesheet) return;

    router.push({
      pathname: '/timesheets/timesheet/delete/[id]',
      params: { id: timesheet.id },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: getTimesheetTitle(timesheet, LL),
          headerBackTitle: client?.name || LL.timesheets.title(),
          headerRight: () =>
            timesheet ? (
              <View style={styles.headerActionGroup}>
                <Pressable
                  style={({ pressed }) => [
                    styles.headerActionButton,
                    { opacity: pressed ? 0.65 : 1 },
                  ]}
                  onPress={handleOpenDeleteFlow}
                  accessibilityRole="button"
                  accessibilityLabel={LL.timesheets.deleteAction()}
                  hitSlop={8}
                >
                  <IconSymbol name="trash.fill" size={18} color={palette.destructive} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      {timesheet ? (
        <>
          <FlatList
            style={styles.list}
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={entriesContentStyle}
            ListHeaderComponent={
              <>
                <View style={[styles.summaryCard, { backgroundColor: palette.cardBackground }]}>
                  <View style={styles.summaryTopRow}>
                    <View style={styles.summaryIdentity}>
                      <ThemedText
                        type="defaultSemiBold"
                        style={styles.summaryTitle}
                        numberOfLines={1}
                      >
                        {getTimesheetTitle(timesheet, LL)}
                      </ThemedText>
                      {getTimesheetSubtitle(timesheet, LL) ? (
                        <ThemedText style={styles.summarySubtitle} numberOfLines={1}>
                          {getTimesheetSubtitle(timesheet, LL)}
                        </ThemedText>
                      ) : null}
                      <ThemedText style={styles.summaryClient} numberOfLines={1}>
                        {client?.name ?? '-'}
                      </ThemedText>
                    </View>
                    <View style={styles.summaryTotalBlock}>
                      <ThemedText style={styles.summaryTotalLabel} numberOfLines={1}>
                        {LL.timesheets.totalDurationLabel()}
                      </ThemedText>
                      <ThemedText
                        style={[styles.summaryTotalValue, { color: palette.timeHighlight }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                      >
                        {formatDuration(totalDuration)}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.summaryDetailsStack}>
                    <View style={styles.summaryDetailsRow}>
                      <View style={styles.summaryDetailItem}>
                        <ThemedText style={styles.summaryDetailLabel} numberOfLines={1}>
                          {LL.timesheets.periodLabel()}
                        </ThemedText>
                        <ThemedText style={styles.summaryDetailValue} numberOfLines={1}>
                          {formatDate(timesheet.periodFrom)} - {formatDate(timesheet.periodTo)}
                        </ThemedText>
                      </View>
                      <View style={[styles.summaryDetailItem, styles.summaryDetailRight]}>
                        <ThemedText
                          style={[styles.summaryDetailLabel, styles.summaryDetailTextRight]}
                          numberOfLines={1}
                        >
                          {LL.timesheets.entriesSectionTitle()}
                        </ThemedText>
                        <ThemedText
                          style={[styles.summaryDetailValue, styles.summaryDetailTextRight]}
                          numberOfLines={1}
                        >
                          {entries.length}
                        </ThemedText>
                      </View>
                    </View>
                    {isTimesheetLinkedToInvoice ? (
                      <View style={styles.summaryDetailsRow}>
                        <View style={styles.summaryDetailItem} />
                        <Pressable
                          style={[styles.summaryDetailItem, styles.summaryDetailRight]}
                          onPress={() => void handleCreateInvoiceFromTimesheet()}
                          accessibilityRole="button"
                          accessibilityLabel={LL.timesheets.openLinkedInvoice()}
                        >
                          <ThemedText
                            style={[styles.summaryDetailLabel, styles.summaryDetailTextRight]}
                            numberOfLines={1}
                          >
                            {LL.invoices.title()}
                          </ThemedText>
                          <ThemedText
                            style={[
                              styles.summaryDetailValue,
                              styles.summaryDetailTextRight,
                              { color: palette.tint },
                            ]}
                            numberOfLines={1}
                          >
                            {linkedInvoiceNumber || '-'}
                          </ThemedText>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.exportActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.invoiceButtonPrimary,
                      {
                        backgroundColor: isTimesheetLinkedToInvoice
                          ? palette.buttonNeutralBackground
                          : palette.tint,
                        opacity: pressed || isPreparingInvoice ? 0.72 : 1,
                      },
                    ]}
                    onPress={() => void handleCreateInvoiceFromTimesheet()}
                    disabled={isPreparingInvoice}
                  >
                    <IconSymbol
                      name={isTimesheetLinkedToInvoice ? 'doc.text.fill' : 'doc.text'}
                      size={16}
                      color={isTimesheetLinkedToInvoice ? palette.tint : palette.onTint}
                    />
                    <ThemedText
                      style={[
                        styles.invoiceButtonPrimaryText,
                        { color: isTimesheetLinkedToInvoice ? palette.tint : palette.onTint },
                      ]}
                      numberOfLines={1}
                    >
                      {isPreparingInvoice
                        ? LL.common.loading()
                        : isTimesheetLinkedToInvoice
                          ? `${LL.invoices.title()}: ${linkedInvoiceNumber || ''}`
                          : LL.invoices.createInvoice()}
                    </ThemedText>
                    <IconSymbol
                      name="chevron.right"
                      size={13}
                      color={isTimesheetLinkedToInvoice ? palette.tint : palette.onTint}
                      style={styles.invoiceButtonChevron}
                    />
                  </Pressable>
                  <View
                    style={[
                      styles.exportSplit,
                      {
                        backgroundColor: palette.cardBackground,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.exportSplitPrimary,
                        {
                          opacity: pressed || isAnyExporting ? 0.72 : 1,
                        },
                      ]}
                      onPress={primaryExportAction.onPress}
                      disabled={isAnyExporting}
                    >
                      <View style={styles.exportShortcutContent}>
                        <IconSymbol name="arrow.down.doc" size={15} color={palette.timeHighlight} />
                        <ThemedText
                          style={[
                            styles.exportButtonSecondaryText,
                            { color: palette.timeHighlight },
                          ]}
                          numberOfLines={1}
                        >
                          {isAnyExporting ? LL.common.loading() : primaryExportAction.label}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.exportSplitArrow,
                        {
                          borderLeftColor: palette.border,
                          opacity: pressed || isAnyExporting ? 0.72 : 1,
                        },
                      ]}
                      onPress={() => setIsExportSheetVisible(true)}
                      disabled={isAnyExporting}
                    >
                      <IconSymbol name="chevron.down" size={14} color={palette.icon} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.entriesSectionHeader}>
                  <ThemedText type="subtitle" style={styles.entriesTitle}>
                    {LL.timesheets.entriesSectionTitle()}
                  </ThemedText>
                  <ThemedText style={[styles.entriesCount, { color: palette.textSecondary }]}>
                    {entries.length}
                  </ThemedText>
                </View>
              </>
            }
            renderItem={({ item, index }) => {
              const isLast = index === entries.length - 1;
              return (
                <GroupedListRow
                  isFirst={index === 0}
                  isLast={isLast}
                  trailing={
                    <ThemedText
                      style={[styles.entryDuration, { color: palette.timeHighlight }]}
                      numberOfLines={1}
                    >
                      {formatDuration(item.timesheetDuration ?? item.duration ?? 0)}
                    </ThemedText>
                  }
                >
                  <ThemedText
                    type="defaultSemiBold"
                    style={!item.description ? styles.muted : undefined}
                    numberOfLines={1}
                  >
                    {item.description || '-'}
                  </ThemedText>
                  <ThemedText style={styles.entryMeta} numberOfLines={1}>
                    {formatDateTime(item.startTime)}
                  </ThemedText>
                </GroupedListRow>
              );
            }}
            ListEmptyComponent={
              <ThemedView style={styles.emptyState}>
                <ActionEmptyState
                  iconName="clock.fill"
                  title={LL.common.nothingHereYetTitle()}
                  description={LL.timeTracking.noEntries()}
                />
              </ThemedView>
            }
          />
          <OptionSheetModal
            visible={isExportSheetVisible}
            title={LL.timesheets.exportAction()}
            message={LL.timesheets.exportActionDescription()}
            cancelLabel={LL.common.cancel()}
            onClose={() => setIsExportSheetVisible(false)}
            options={[
              {
                key: 'pdf',
                label: LL.timesheets.exportPdf(),
                onPress: () => queueExportSheetAction('pdf'),
                disabled: isAnyExporting,
              },
              ...(isPdfSaveEnabled
                ? [
                    {
                      key: 'save-pdf',
                      label: LL.timesheets.savePdf(),
                      onPress: () => queueExportSheetAction('save_pdf'),
                      disabled: isAnyExporting,
                    },
                  ]
                : []),
              ...(isPdfOpenEnabled
                ? [
                    {
                      key: 'open-pdf',
                      label: LL.timesheets.openPdf(),
                      onPress: () => queueExportSheetAction('open_pdf'),
                      disabled: isAnyExporting,
                    },
                  ]
                : []),
              {
                key: 'xlsx',
                label: LL.timesheets.exportXlsx(),
                onPress: () => queueExportSheetAction('xlsx'),
                disabled: isAnyExporting,
              },
              ...(exportIntegrationsEnabled
                ? [
                    {
                      key: 'xml',
                      label: LL.timesheets.exportXml(),
                      onPress: () => void handleExportXml(),
                      disabled: isAnyExporting,
                    },
                  ]
                : []),
            ]}
          />
          <OptionSheetModal
            visible={isXmlExportSheetVisible}
            title={LLExport.timesheets.exportSelectIntegration()}
            message={LLExport.timesheets.exportXmlDescription()}
            cancelLabel={LL.common.cancel()}
            onClose={() => setIsXmlExportSheetVisible(false)}
            options={[
              {
                key: 'base-xml',
                label: LLExport.timesheets.exportBaseXmlOption(),
                onPress: () => queueExportSheetAction('xml_base'),
                disabled: isAnyExporting,
              },
              ...timesheetExportIntegrations.map((integration) => ({
                key: integration.id,
                label: integration.name,
                onPress: () => queueExportSheetAction(`integration:${integration.id}`),
                disabled: isAnyExporting,
              })),
            ]}
          />
        </>
      ) : (
        <ThemedView style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>{LL.common.loading()}</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  list: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    marginBottom: 12,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 17,
  },
  summarySubtitle: {
    fontSize: 13,
    opacity: 0.72,
  },
  summaryClient: {
    fontSize: 13,
    opacity: 0.72,
  },
  summaryTotalBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '46%',
    gap: 2,
  },
  summaryTotalLabel: {
    fontSize: 11,
    opacity: 0.62,
    textAlign: 'right',
  },
  summaryTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  summaryDetailsStack: {
    gap: 8,
  },
  summaryDetailsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryDetailItem: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryDetailRight: {
    alignItems: 'flex-end',
  },
  summaryDetailLabel: {
    fontSize: 11,
    opacity: 0.55,
  },
  summaryDetailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryDetailTextRight: {
    textAlign: 'right',
  },
  exportActions: {
    gap: 8,
    marginBottom: 12,
  },
  exportSplit: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  exportSplitPrimary: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  exportShortcutContent: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exportSplitArrow: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  headerActionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -6,
  },
  exportButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  invoiceButtonPrimary: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  invoiceButtonChevron: {
    marginLeft: 'auto',
  },
  entriesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  entriesTitle: {
    flex: 1,
    minWidth: 0,
  },
  entriesCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  entriesContent: {
    paddingBottom: 24,
  },
  entryMeta: {
    fontSize: 12,
    opacity: 0.65,
  },
  entryDuration: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: {
    opacity: 0.55,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    opacity: 0.6,
    fontSize: 15,
  },
});
