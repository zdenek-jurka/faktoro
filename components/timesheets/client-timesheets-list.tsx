import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import {
  ClientModel,
  InvoiceItemModel,
  InvoiceModel,
  TimeEntryModel,
  TimesheetModel,
} from '@/model';
import { TimesheetPreset } from '@/repositories/timesheet-repository';
import { isAndroid } from '@/utils/platform';
import { Q } from '@nozbe/watermelondb';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useState, useEffect } from 'react';
import { FlatList, StyleSheet, Pressable, Text, View } from 'react-native';

type TimesheetItem = {
  timesheet: TimesheetModel;
  entriesCount: number;
  duration: number;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

type Props = {
  clientId: string;
  backToClientId?: string;
  onTimesheetPress?: (timesheetId: string) => void;
};

export function ClientTimesheetsList({ clientId, backToClientId, onTimesheetPress }: Props) {
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);
  const intlLocale = normalizeIntlLocale(locale, 'en');

  const [client, setClient] = useState<ClientModel | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetModel[]>([]);
  const [timesheetEntries, setTimesheetEntries] = useState<TimeEntryModel[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemModel[]>([]);
  const [invoices, setInvoices] = useState<InvoiceModel[]>([]);

  useEffect(() => {
    if (!clientId) return;

    const clientSubscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(clientId)
      .subscribe(setClient);

    const timesheetsSubscription = database
      .get<TimesheetModel>(TimesheetModel.table)
      .query(Q.where('client_id', clientId), Q.sortBy('period_from', Q.desc))
      .observeWithColumns([
        'client_id',
        'timesheet_number',
        'label',
        'period_type',
        'period_from',
        'period_to',
      ])
      .subscribe(setTimesheets);

    return () => {
      clientSubscription.unsubscribe();
      timesheetsSubscription.unsubscribe();
    };
  }, [clientId]);

  const timesheetIds = useMemo(() => timesheets.map((t) => t.id), [timesheets]);
  const invoiceIds = useMemo(
    () =>
      Array.from(
        new Set(
          invoiceItems
            .map((item) => item.invoiceId)
            .filter((invoiceId): invoiceId is string => !!invoiceId),
        ),
      ),
    [invoiceItems],
  );

  useEffect(() => {
    if (timesheetIds.length === 0) {
      setTimesheetEntries([]);
      return;
    }
    const sub = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', Q.oneOf(timesheetIds)))
      .observeWithColumns(['timesheet_id', 'duration', 'timesheet_duration'])
      .subscribe(setTimesheetEntries);
    return () => sub.unsubscribe();
  }, [timesheetIds]);

  useEffect(() => {
    if (timesheetIds.length === 0) {
      setInvoiceItems([]);
      return;
    }
    const sub = database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('source_kind', 'timesheet'), Q.where('source_id', Q.oneOf(timesheetIds)))
      .observeWithColumns(['source_kind', 'source_id', 'invoice_id'])
      .subscribe(setInvoiceItems);
    return () => sub.unsubscribe();
  }, [timesheetIds]);

  useEffect(() => {
    if (invoiceIds.length === 0) {
      setInvoices([]);
      return;
    }
    const sub = database
      .get<InvoiceModel>(InvoiceModel.table)
      .query(Q.where('id', Q.oneOf(invoiceIds)))
      .observeWithColumns(['invoice_number'])
      .subscribe(setInvoices);
    return () => sub.unsubscribe();
  }, [invoiceIds]);

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString(intlLocale);

  const getPeriodLabel = (periodType: string): string => {
    switch (periodType as TimesheetPreset) {
      case 'all':
        return LL.timesheets.periodAll();
      case 'this_month':
        return LL.timesheets.periodThisMonth();
      case 'last_month':
        return LL.timesheets.periodLastMonth();
      case 'this_quarter':
        return LL.timesheets.periodThisQuarter();
      case 'last_quarter':
        return LL.timesheets.periodLastQuarter();
      case 'this_year':
        return LL.timesheets.periodThisYear();
      case 'last_year':
        return LL.timesheets.periodLastYear();
      case 'this_week':
        return LL.timesheets.periodThisWeek();
      case 'last_week':
        return LL.timesheets.periodLastWeek();
      case 'last_7_days':
        return LL.timesheets.periodLast7Days();
      case 'custom':
      default:
        return LL.timesheets.periodCustom();
    }
  };

  const getTimesheetTitle = (timesheet: TimesheetModel): string =>
    timesheet.timesheetNumber?.trim() ||
    timesheet.label?.trim() ||
    getPeriodLabel(timesheet.periodType);

  const getTimesheetSubtitle = (timesheet: TimesheetModel): string | undefined => {
    if (!timesheet.timesheetNumber?.trim()) return undefined;
    return timesheet.label?.trim() || getPeriodLabel(timesheet.periodType);
  };

  const items = useMemo<TimesheetItem[]>(() => {
    const statsByTimesheet = new Map<string, { entriesCount: number; duration: number }>();
    for (const entry of timesheetEntries) {
      if (!entry.timesheetId) continue;
      const current = statsByTimesheet.get(entry.timesheetId) ?? { entriesCount: 0, duration: 0 };
      current.entriesCount += 1;
      current.duration += entry.timesheetDuration ?? entry.duration ?? 0;
      statsByTimesheet.set(entry.timesheetId, current);
    }
    return timesheets.map((timesheet) => {
      const stats = statsByTimesheet.get(timesheet.id) ?? { entriesCount: 0, duration: 0 };
      return { timesheet, entriesCount: stats.entriesCount, duration: stats.duration };
    });
  }, [timesheetEntries, timesheets]);

  const linkedInvoiceByTimesheetId = useMemo(() => {
    const invoiceNumberById = new Map<string, string>();
    for (const invoice of invoices) {
      invoiceNumberById.set(invoice.id, invoice.invoiceNumber?.trim() || invoice.id);
    }
    const map = new Map<string, { invoiceId: string; invoiceNumber: string }>();
    for (const item of invoiceItems) {
      if (!item.sourceId || item.sourceKind !== 'timesheet' || !item.invoiceId) continue;
      if (map.has(item.sourceId)) continue;
      map.set(item.sourceId, {
        invoiceId: item.invoiceId,
        invoiceNumber: invoiceNumberById.get(item.invoiceId) || item.invoiceId,
      });
    }
    return map;
  }, [invoiceItems, invoices]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: client?.name?.trim()
            ? `${client.name.trim()} – ${LL.timesheets.title()}`
            : LL.timesheets.title(),
          headerLeft: backToClientId
            ? () => (
                <Pressable
                  hitSlop={8}
                  onPress={() => router.navigate(`/clients/detail/${backToClientId}`)}
                  style={styles.headerBackButton}
                >
                  <IconSymbol name="chevron.left" size={18} color={palette.tint} />
                  {!isAndroid && (
                    <Text
                      style={[styles.headerBackLabel, { color: palette.tint }]}
                      numberOfLines={1}
                    >
                      {client?.name ?? LL.tabs.clients()}
                    </Text>
                  )}
                </Pressable>
              )
            : undefined,
        }}
      />

      <FlatList
        contentContainerStyle={listContentStyle}
        data={items}
        keyExtractor={(item) => item.timesheet.id}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets={true}
        renderItem={({ item, index }) => {
          const isLast = index === items.length - 1;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: palette.cardBackground },
                index === 0 && styles.rowFirst,
                isLast && styles.rowLast,
                pressed && styles.rowPressed,
              ]}
              onPress={() =>
                onTimesheetPress
                  ? onTimesheetPress(item.timesheet.id)
                  : router.push(`/timesheets/timesheet/${item.timesheet.id}`)
              }
              android_ripple={{ color: palette.border }}
              accessibilityRole="button"
              accessibilityLabel={[
                getTimesheetTitle(item.timesheet),
                getTimesheetSubtitle(item.timesheet),
              ]
                .filter(Boolean)
                .join(', ')}
            >
              <View style={styles.rowMain}>
                <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
                  {getTimesheetTitle(item.timesheet)}
                </ThemedText>
                {getTimesheetSubtitle(item.timesheet) ? (
                  <ThemedText style={styles.rowMeta}>
                    {getTimesheetSubtitle(item.timesheet)}
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.rowMeta}>
                  {formatDate(item.timesheet.periodFrom)} - {formatDate(item.timesheet.periodTo)}
                </ThemedText>
                <ThemedText style={styles.rowMeta}>
                  {LL.timesheets.entriesCount({ count: item.entriesCount })}
                </ThemedText>
                {linkedInvoiceByTimesheetId.has(item.timesheet.id) && (
                  <View style={[styles.invoiceBadge, { borderColor: palette.border }]}>
                    <ThemedText style={[styles.invoiceBadgeText, { color: palette.textSecondary }]}>
                      {`${LL.invoices.title()}: ${linkedInvoiceByTimesheetId.get(item.timesheet.id)?.invoiceNumber}`}
                    </ThemedText>
                  </View>
                )}
              </View>

              <View style={styles.rowRight}>
                <View style={[styles.timeBadge, { backgroundColor: palette.timeHighlight }]}>
                  <ThemedText style={[styles.timeBadgeText, { color: palette.onHighlight }]}>
                    {formatDuration(item.duration)}
                  </ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={20} color={palette.icon} />
              </View>

              {!isLast && <View style={styles.divider} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <ThemedView style={styles.emptyState}>
            <ActionEmptyState
              iconName="doc.text.fill"
              title={LL.common.nothingHereYetTitle()}
              description={LL.timesheets.noClientTimesheets()}
            />
          </ThemedView>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  listContent: { paddingBottom: 24 },
  headerBackButton: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 160 },
  headerBackLabel: { fontSize: 17 },
  row: { paddingHorizontal: 14, paddingVertical: 12, position: 'relative' },
  rowPressed: { opacity: 0.72 },
  rowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10, marginBottom: 12 },
  rowMain: { flex: 1, gap: 2, paddingRight: 96 },
  rowTitle: { fontSize: 16 },
  rowMeta: { fontSize: 12, opacity: 0.65 },
  invoiceBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  invoiceBadgeText: { fontSize: 11, fontWeight: '600' },
  rowRight: { position: 'absolute', right: 14, top: 14, alignItems: 'flex-end', gap: 4 },
  timeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  timeBadgeText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.light.borderStrong,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
});
