import { Q } from '@nozbe/watermelondb';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { BorderRadius, FontSizes } from '@/constants/theme';
import database from '@/db';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import AppSettingsModel from '@/model/AppSettingsModel';
import ClientModel from '@/model/ClientModel';
import InvoiceItemModel from '@/model/InvoiceItemModel';
import InvoiceModel from '@/model/InvoiceModel';
import TimesheetModel from '@/model/TimesheetModel';
import TimeEntryModel from '@/model/TimeEntryModel';
import { getSettings } from '@/repositories/settings-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'this_month' | 'last_month' | 'this_year' | 'all';

interface ClientStat {
  clientId: string;
  name: string;
  value: number;
  currency?: string;
}

interface ReportData {
  totalSeconds: number;
  invoicedRevenueByCurrency: { currency: string; total: number }[];
  unbilledSeconds: number;
  unbilledEstimateByCurrency: { currency: string; total: number }[];
  avgRateByCurrency: { currency: string; avg: number }[];
  unbilledEntriesCount: number;
  uninvoicedTimesheetsCount: number;
  hoursByClient: ClientStat[];
  revenueByClient: ClientStat[];
  defaultCurrency: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPeriodRange(period: Period): { start: number; end: number } | null {
  const now = new Date();
  switch (period) {
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }
    case 'all':
      return null;
  }
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const [period, setPeriod] = useState<Period>('this_month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getSettings();
      const range = getPeriodRange(period);

      const rangedEntryQuery = range
        ? database
            .get<TimeEntryModel>('time_entry')
            .query(
              Q.where('is_running', false),
              Q.where('end_time', Q.notEq(null)),
              Q.where('end_time', Q.gte(range.start)),
              Q.where('end_time', Q.lte(range.end)),
            )
        : database
            .get<TimeEntryModel>('time_entry')
            .query(Q.where('is_running', false), Q.where('end_time', Q.notEq(null)));

      // All completed entries (any period) — for unbilled count
      const allUnbilledQuery = database
        .get<TimeEntryModel>('time_entry')
        .query(
          Q.where('is_running', false),
          Q.where('end_time', Q.notEq(null)),
          Q.where('timesheet_id', Q.eq(null)),
        );

      // All timesheets + invoice items referencing timesheets (to compute uninvoiced count)
      const allTimesheetsQuery = database.get<TimesheetModel>('timesheet').query();
      const timesheetInvoiceItemsQuery = database
        .get<InvoiceItemModel>('invoice_item')
        .query(Q.where('source_kind', 'timesheet'));

      // Invoice conditions
      const invoicesQuery = range
        ? database
            .get<InvoiceModel>('invoice')
            .query(Q.where('issued_at', Q.gte(range.start)), Q.where('issued_at', Q.lte(range.end)))
        : database.get<InvoiceModel>('invoice').query();

      const [entries, allUnbilled, allTimesheets, timesheetInvoiceItems, invoices, clients] =
        await Promise.all([
          rangedEntryQuery.fetch(),
          allUnbilledQuery.fetch(),
          allTimesheetsQuery.fetch(),
          timesheetInvoiceItemsQuery.fetch(),
          invoicesQuery.fetch(),
          database.get<ClientModel>('client').query().fetch(),
        ]);

      const invoicedTimesheetIds = new Set(timesheetInvoiceItems.map((ii) => ii.sourceId));
      const uninvoicedTimesheetsCount = allTimesheets.filter(
        (ts) => !invoicedTimesheetIds.has(ts.id),
      ).length;

      const clientMap = new Map(clients.map((c) => [c.id, c]));

      // Aggregations
      const totalSeconds = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);
      const defaultCurrency = normalizeCurrencyCode(settings.defaultInvoiceCurrency);

      const unbilledInPeriod = range ? entries.filter((e) => !e.timesheetId) : allUnbilled;
      const unbilledSeconds = unbilledInPeriod.reduce((sum, e) => sum + (e.duration ?? 0), 0);
      const unbilledEstimateByCurrencyMap = new Map<string, number>();
      unbilledInPeriod.forEach((entry) => {
        if (!entry.rate || !entry.duration) return;
        const currency = normalizeCurrencyCode(entry.rateCurrency, defaultCurrency);
        unbilledEstimateByCurrencyMap.set(
          currency,
          (unbilledEstimateByCurrencyMap.get(currency) ?? 0) + (entry.duration / 3600) * entry.rate,
        );
      });
      const unbilledEstimateByCurrency = [...unbilledEstimateByCurrencyMap.entries()]
        .map(([currency, total]) => ({ currency, total }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

      const invoiceTotalsByCurrency = new Map<string, number>();
      invoices.forEach((invoice) => {
        const currency = normalizeCurrencyCode(invoice.currency, defaultCurrency);
        invoiceTotalsByCurrency.set(
          currency,
          (invoiceTotalsByCurrency.get(currency) ?? 0) + invoice.total,
        );
      });
      const invoicedRevenueByCurrency = [...invoiceTotalsByCurrency.entries()]
        .map(([currency, total]) => ({ currency, total }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
      const hasMultipleInvoiceCurrencies = invoicedRevenueByCurrency.length > 1;

      // Average rate (only from entries with a rate)
      const avgRateByCurrencyMap = new Map<string, { totalRate: number; count: number }>();
      entries.forEach((entry) => {
        if (!entry.rate || entry.rate <= 0 || (entry.duration ?? 0) <= 0) return;
        const currency = normalizeCurrencyCode(entry.rateCurrency, defaultCurrency);
        const current = avgRateByCurrencyMap.get(currency) ?? { totalRate: 0, count: 0 };
        current.totalRate += entry.rate;
        current.count += 1;
        avgRateByCurrencyMap.set(currency, current);
      });
      const avgRateByCurrency = [...avgRateByCurrencyMap.entries()]
        .map(([currency, current]) => ({ currency, avg: current.totalRate / current.count }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

      // Hours by client
      const hoursByClientMap = new Map<string, number>();
      entries.forEach((e) => {
        const h = (e.duration ?? 0) / 3600;
        hoursByClientMap.set(e.clientId, (hoursByClientMap.get(e.clientId) ?? 0) + h);
      });
      const hoursByClient: ClientStat[] = [...hoursByClientMap.entries()]
        .map(([id, value]) => ({ clientId: id, name: clientMap.get(id)?.name ?? '?', value }))
        .sort((a, b) => b.value - a.value);

      // Revenue by client
      const revenueByClientMap = new Map<
        string,
        { clientId: string; currency: string; total: number }
      >();
      invoices.forEach((inv) => {
        const currency = normalizeCurrencyCode(inv.currency, defaultCurrency);
        const key = `${inv.clientId}::${currency}`;
        const current = revenueByClientMap.get(key) ?? {
          clientId: inv.clientId,
          currency,
          total: 0,
        };
        current.total += inv.total;
        revenueByClientMap.set(key, current);
      });
      const revenueByClient: ClientStat[] = [...revenueByClientMap.values()]
        .map(({ clientId, currency, total }) => ({
          clientId,
          currency,
          name: hasMultipleInvoiceCurrencies
            ? `${clientMap.get(clientId)?.name ?? '?'} • ${currency}`
            : (clientMap.get(clientId)?.name ?? '?'),
          value: total,
        }))
        .sort((a, b) => b.value - a.value);

      setData({
        totalSeconds,
        invoicedRevenueByCurrency,
        unbilledSeconds,
        unbilledEstimateByCurrency,
        avgRateByCurrency,
        unbilledEntriesCount: allUnbilled.length,
        uninvoicedTimesheetsCount,
        hoursByClient,
        revenueByClient,
        defaultCurrency,
      });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribeCallbacks: (() => void)[] = [];
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        void loadData();
      }, 120);
    };

    const subscribeAfterInitialEmission = (
      subscribe: (onChange: () => void) => { unsubscribe: () => void },
    ) => {
      let hasReceivedInitialValue = false;
      const subscription = subscribe(() => {
        if (!hasReceivedInitialValue) {
          hasReceivedInitialValue = true;
          return;
        }
        scheduleReload();
      });
      unsubscribeCallbacks.push(() => subscription.unsubscribe());
    };

    subscribeAfterInitialEmission((onChange) =>
      database.get<TimeEntryModel>('time_entry').query().observe().subscribe(onChange),
    );
    subscribeAfterInitialEmission((onChange) =>
      database.get<TimesheetModel>('timesheet').query().observe().subscribe(onChange),
    );
    subscribeAfterInitialEmission((onChange) =>
      database.get<InvoiceItemModel>('invoice_item').query().observe().subscribe(onChange),
    );
    subscribeAfterInitialEmission((onChange) =>
      database.get<InvoiceModel>('invoice').query().observe().subscribe(onChange),
    );
    subscribeAfterInitialEmission((onChange) =>
      database.get<ClientModel>('client').query().observe().subscribe(onChange),
    );
    subscribeAfterInitialEmission((onChange) =>
      database.get<AppSettingsModel>('app_settings').query().observe().subscribe(onChange),
    );

    return () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadData]);

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'this_month', label: LL.reports.periodThisMonth() },
    { key: 'last_month', label: LL.reports.periodLastMonth() },
    { key: 'this_year', label: LL.reports.periodThisYear() },
    { key: 'all', label: LL.reports.periodAll() },
  ];

  const invoicedRevenueValue = useMemo(() => {
    if (!data) return '';
    if (data.invoicedRevenueByCurrency.length === 0) {
      return formatPrice(0, data.defaultCurrency, intlLocale);
    }
    return data.invoicedRevenueByCurrency
      .map((entry) => formatPrice(entry.total, entry.currency, intlLocale))
      .join('\n');
  }, [data, intlLocale]);

  const unbilledEstimateValue = useMemo(() => {
    if (!data) return '';
    if (data.unbilledEstimateByCurrency.length === 0) {
      return formatHours(data.unbilledSeconds);
    }
    return data.unbilledEstimateByCurrency
      .map((entry) => formatPrice(entry.total, entry.currency, intlLocale))
      .join('\n');
  }, [data, intlLocale]);

  const avgRateValue = useMemo(() => {
    if (!data || data.avgRateByCurrency.length === 0) return '';
    return data.avgRateByCurrency
      .map(
        (entry) => `${formatPrice(entry.avg, entry.currency, intlLocale)} ${LL.reports.perHour()}`,
      )
      .join('\n');
  }, [LL, data, intlLocale]);

  const isTrulyEmpty =
    !!data &&
    data.totalSeconds === 0 &&
    data.invoicedRevenueByCurrency.length === 0 &&
    data.unbilledEntriesCount === 0 &&
    data.uninvoicedTimesheetsCount === 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.reports.title() }} />

      {/* Period selector */}
      <View style={[styles.periodBar, { borderBottomColor: palette.border }]}>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.periodChip, active && { backgroundColor: palette.tint }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <ThemedText
                style={[
                  styles.periodChipText,
                  active
                    ? { color: palette.onTint, fontWeight: '600' }
                    : { color: palette.textSecondary },
                ]}
              >
                {p.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={palette.tint} size="large" />
        </View>
      ) : isTrulyEmpty ? (
        <View style={styles.emptyWrap}>
          <ActionEmptyState
            iconName="chart.bar.fill"
            title={LL.reports.emptyTitle()}
            description={LL.reports.emptyDescription()}
            actionLabel={LL.timeTracking.startTimer()}
            onActionPress={() => router.push('/time-tracking')}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── KPI cards ── */}
          <View style={styles.kpiRow}>
            <KpiCard
              label={LL.reports.trackedHours()}
              value={formatHours(data?.totalSeconds ?? 0)}
              palette={palette}
            />
            <KpiCard
              label={LL.reports.invoicedRevenue()}
              value={invoicedRevenueValue}
              palette={palette}
            />
            <KpiCard
              label={LL.reports.unbilledEstimate()}
              value={unbilledEstimateValue}
              palette={palette}
              highlight={(data?.unbilledSeconds ?? 0) > 0}
            />
          </View>

          {/* Avg rate */}
          {data && data.avgRateByCurrency.length > 0 && (
            <View
              style={[
                styles.avgRateRow,
                { backgroundColor: palette.cardBackground, borderColor: palette.border },
              ]}
            >
              <ThemedText style={[styles.avgRateLabel, { color: palette.textSecondary }]}>
                {LL.reports.avgRate()}
              </ThemedText>
              <ThemedText style={[styles.avgRateValue, { color: palette.text }]}>
                {avgRateValue}
              </ThemedText>
            </View>
          )}

          {/* Unbilled alerts */}
          {data!.unbilledEntriesCount > 0 && (
            <AlertRow
              text={LL.reports.unbilledEntries({ count: data!.unbilledEntriesCount })}
              palette={palette}
            />
          )}
          {data!.uninvoicedTimesheetsCount > 0 && (
            <AlertRow
              text={LL.reports.uninvoicedTimesheets({ count: data!.uninvoicedTimesheetsCount })}
              palette={palette}
            />
          )}

          {(data!.unbilledEntriesCount > 0 || data!.uninvoicedTimesheetsCount > 0) && (
            <Section title={LL.reports.nextStepsTitle()} palette={palette}>
              <View style={styles.actionsList}>
                {data!.unbilledEntriesCount > 0 && (
                  <ReportsActionRow
                    label={LL.reports.reviewEntriesAction()}
                    onPress={() => router.push('/time-tracking')}
                    palette={palette}
                  />
                )}
                {data!.uninvoicedTimesheetsCount > 0 && (
                  <ReportsActionRow
                    label={LL.reports.openTimesheetsAction()}
                    onPress={() => router.push('/timesheets')}
                    palette={palette}
                  />
                )}
                {data!.uninvoicedTimesheetsCount > 0 && (
                  <ReportsActionRow
                    label={LL.reports.createInvoiceAction()}
                    onPress={() => router.push('/invoices/new')}
                    palette={palette}
                    emphasis
                  />
                )}
              </View>
            </Section>
          )}

          {/* ── Time by client ── */}
          {data!.hoursByClient.length > 0 && (
            <Section title={LL.reports.timeByClient()} palette={palette}>
              <BarList
                items={data!.hoursByClient}
                formatValue={(item) => `${item.value.toFixed(1)} ${LL.reports.hoursUnit()}`}
                palette={palette}
                onItemPress={(item) => router.push(`/clients/detail/${item.clientId}`)}
              />
            </Section>
          )}

          {/* ── Revenue by client ── */}
          {data!.revenueByClient.length > 0 && (
            <Section title={LL.reports.revenueByClient()} palette={palette}>
              <BarList
                items={data!.revenueByClient}
                formatValue={(item) =>
                  formatPrice(item.value, item.currency ?? data!.defaultCurrency, intlLocale)
                }
                palette={palette}
                onItemPress={(item) => router.push(`/clients/detail/${item.clientId}`)}
              />
            </Section>
          )}

          {data!.hoursByClient.length === 0 && data!.revenueByClient.length === 0 && (
            <View style={styles.empty}>
              <ThemedText style={{ color: palette.textSecondary, textAlign: 'center' }}>
                {LL.reports.noData()}
              </ThemedText>
            </View>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface Palette {
  cardBackground: string;
  border: string;
  tint: string;
  onTint: string;
  text: string;
  textSecondary: string;
  destructive: string;
  success: string;
  [key: string]: string;
}

function KpiCard({
  label,
  value,
  subValue,
  palette,
  highlight = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  palette: Palette;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.kpiCard,
        {
          backgroundColor: palette.cardBackground,
          borderColor: highlight ? palette.destructive : palette.border,
          borderWidth: highlight ? 1.5 : 1,
        },
      ]}
    >
      <ThemedText style={[styles.kpiLabel, { color: palette.textSecondary }]}>{label}</ThemedText>
      <ThemedText
        style={[styles.kpiValue, { color: highlight ? palette.destructive : palette.text }]}
      >
        {value}
      </ThemedText>
      {subValue != null && (
        <ThemedText style={[styles.kpiSub, { color: palette.textSecondary }]}>
          {subValue}
        </ThemedText>
      )}
    </View>
  );
}

function AlertRow({ text, palette }: { text: string; palette: Palette }) {
  return (
    <View
      style={[
        styles.alertRow,
        { backgroundColor: palette.cardBackground, borderColor: palette.border },
      ]}
    >
      <View style={[styles.alertDot, { backgroundColor: palette.destructive }]} />
      <ThemedText style={[styles.alertText, { color: palette.textSecondary }]}>{text}</ThemedText>
    </View>
  );
}

function ReportsActionRow({
  label,
  onPress,
  palette,
  emphasis = false,
}: {
  label: string;
  onPress: () => void;
  palette: Palette;
  emphasis?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionRow,
        {
          backgroundColor: emphasis ? palette.tint : palette.cardBackground,
          borderColor: emphasis ? palette.tint : palette.border,
        },
        pressed && styles.actionRowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <ThemedText
        style={[styles.actionRowLabel, { color: emphasis ? palette.onTint : palette.text }]}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.actionRowChevron,
          { color: emphasis ? palette.onTint : palette.textSecondary },
        ]}
      >
        ›
      </ThemedText>
    </Pressable>
  );
}

function Section({
  title,
  palette,
  children,
}: {
  title: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: palette.textSecondary }]}>
        {title}
      </ThemedText>
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: palette.cardBackground, borderColor: palette.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function BarList({
  items,
  formatValue,
  palette,
  onItemPress,
}: {
  items: ClientStat[];
  formatValue: (item: ClientStat) => string;
  palette: Palette;
  onItemPress?: (item: ClientStat) => void;
}) {
  const max = items[0]?.value ?? 1;
  return (
    <>
      {items.map((item, idx) => {
        const pct = Math.max(4, (item.value / max) * 100);
        return (
          <Pressable
            key={item.clientId}
            style={({ pressed }) => [
              styles.barRow,
              idx < items.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              },
              onItemPress && pressed ? styles.barRowPressed : null,
            ]}
            onPress={onItemPress ? () => onItemPress(item) : undefined}
            disabled={!onItemPress}
            accessibilityRole={onItemPress ? 'button' : undefined}
          >
            <View style={styles.barRowLeft}>
              <InitialsAvatar name={item.name} size={30} fontSize={FontSizes.xs} />
              <ThemedText style={styles.barRowName} numberOfLines={1}>
                {item.name}
              </ThemedText>
            </View>
            <View style={styles.barRowRight}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%` as any, backgroundColor: palette.tint, opacity: 0.25 },
                  ]}
                />
              </View>
              <ThemedText style={[styles.barValue, { color: palette.textSecondary }]}>
                {formatValue(item)}
              </ThemedText>
              {onItemPress ? (
                <ThemedText style={[styles.barChevron, { color: palette.textSecondary }]}>
                  ›
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  periodBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  periodChip: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    alignItems: 'center',
  },
  periodChipText: {
    fontSize: FontSizes.xs,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
  },

  // KPI cards
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  kpiLabel: {
    fontSize: FontSizes.xs,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: FontSizes.xs,
  },

  // Avg rate
  avgRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avgRateLabel: {
    fontSize: FontSizes.sm,
  },
  avgRateValue: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },

  // Alerts
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertText: {
    fontSize: FontSizes.sm,
    flex: 1,
  },
  actionsList: {
    padding: 12,
    gap: 10,
  },
  actionRow: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRowPressed: {
    opacity: 0.82,
  },
  actionRowLabel: {
    flex: 1,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  actionRowChevron: {
    fontSize: 20,
    marginLeft: 12,
  },

  // Sections
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Bar rows
  barRow: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  barRowPressed: {
    opacity: 0.78,
  },
  barRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  barRowName: {
    fontSize: FontSizes.sm,
    fontWeight: '500',
    flex: 1,
  },
  barRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.12)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barValue: {
    fontSize: FontSizes.sm,
    minWidth: 80,
    textAlign: 'right',
  },
  barChevron: {
    fontSize: 18,
    lineHeight: 18,
  },

  // Empty state
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
});
