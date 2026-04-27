import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CreateTimesheetModal } from '@/components/time-tracking/create-timesheet-modal';
import { PauseStopTimerControl } from '@/components/time-tracking/pause-stop-timer-control';
import { StartTimerModal } from '@/components/time-tracking/start-timer-modal';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableList } from '@/components/ui/swipeable-list';
import database from '@/db';
import { usePalette } from '@/hooks/use-palette';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, PriceListItemModel, TimeEntryModel } from '@/model';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getPriceListItems } from '@/repositories/price-list-repository';
import { getSettings, observeSettings } from '@/repositories/settings-repository';
import {
  deleteTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
} from '@/repositories/time-entry-repository';
import { createTimesheetFromPeriod } from '@/repositories/timesheet-repository';
import { isAndroid } from '@/utils/platform';
import { formatPrice } from '@/utils/price-utils';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { hasEffectiveBillingInterval, roundTimeByInterval } from '@/utils/time-utils';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import { Q } from '@nozbe/watermelondb';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Pressable, Text, View } from 'react-native';

type Props = {
  clientId: string;
  backToClientId?: string;
  editBasePath?: 'time-tracking' | 'clients';
};

export function ClientTimeEntriesContent({
  clientId,
  backToClientId,
  editBasePath = 'time-tracking',
}: Props) {
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();

  const [client, setClient] = useState<ClientModel | null>(null);
  const [entries, setEntries] = useState<TimeEntryModel[]>([]);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntryModel | null>(null);
  const [hasRunningEntryElsewhere, setHasRunningEntryElsewhere] = useState(false);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | undefined>();
  const [nowMs, setNowMs] = useState(Date.now());

  const [showStartModal, setShowStartModal] = useState(false);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);

  const getControlErrorMessage = (fallback: string, error: unknown) => {
    if (error instanceof Error && error.message === 'TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN') {
      return LL.timeTracking.errorControlOtherDevice();
    }
    return fallback;
  };

  useEffect(() => {
    if (!clientId) return;

    const clientSubscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(clientId)
      .subscribe(setClient);

    const entriesSubscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(
        Q.where('client_id', clientId),
        Q.where('timesheet_id', null),
        Q.sortBy('start_time', Q.desc),
      )
      .observeWithColumns([
        'client_id',
        'timesheet_id',
        'start_time',
        'duration',
        'is_running',
        'is_paused',
        'paused_at',
        'total_paused_duration',
        'description',
        'price_list_item_id',
        'rate',
        'rate_currency',
      ])
      .subscribe(setEntries);

    return () => {
      clientSubscription.unsubscribe();
      entriesSubscription.unsubscribe();
    };
  }, [clientId]);

  useEffect(() => {
    const subscription = getPriceListItems(false)
      .observeWithColumns(['name', 'default_price', 'default_price_currency', 'unit', 'is_active'])
      .subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadDevice = async () => {
      const settings = await getSettings();
      setDefaultBillingInterval(settings.defaultBillingInterval);
      const deviceSettings = await getDeviceSyncSettings(settings);
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    };
    void loadDevice();

    const unsubscribeSettings = observeSettings(
      (settings) => {
        setDefaultBillingInterval(settings?.defaultBillingInterval);
      },
      ['default_billing_interval'],
    );
    const deviceSubscription = observeDeviceSyncSettings((deviceSettings) => {
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    });

    return () => {
      unsubscribeSettings();
      deviceSubscription();
    };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('is_running', true))
      .observeWithColumns([
        'client_id',
        'description',
        'price_list_item_id',
        'rate',
        'rate_currency',
        'is_paused',
        'paused_at',
        'total_paused_duration',
        'running_device_id',
        'running_device_name',
      ])
      .subscribe((allRunningEntries) => {
        const runningInOtherClient = allRunningEntries.some((entry) => {
          const isLocal =
            !entry.runningDeviceId || (!!localDeviceId && entry.runningDeviceId === localDeviceId);
          return isLocal && entry.clientId !== clientId;
        });
        setHasRunningEntryElsewhere(runningInOtherClient);

        const runningForCurrentClient = allRunningEntries.filter(
          (entry) => entry.clientId === clientId,
        );
        if (runningForCurrentClient.length === 0) {
          setRunningEntry(null);
          return;
        }
        const localEntry = runningForCurrentClient.find(
          (entry) =>
            !entry.runningDeviceId || (!!localDeviceId && entry.runningDeviceId === localDeviceId),
        );
        setRunningEntry(localEntry || runningForCurrentClient[0]);
      });

    return () => subscription.unsubscribe();
  }, [clientId, localDeviceId]);

  useEffect(() => {
    const hasRunningEntry = entries.some((entry) => entry.isRunning);
    if (!hasRunningEntry) return;

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [entries]);

  const canControlRunningEntry =
    !!runningEntry &&
    (!runningEntry.runningDeviceId || runningEntry.runningDeviceId === localDeviceId);
  const canStartTimer = !runningEntry && !hasRunningEntryElsewhere;

  const localRunningEntry = useMemo(() => {
    if (!runningEntry) return null;
    if (!runningEntry.runningDeviceId) return runningEntry;
    return runningEntry.runningDeviceId === localDeviceId ? runningEntry : null;
  }, [localDeviceId, runningEntry]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  const priceListById = useMemo(() => {
    const map = new Map<string, PriceListItemModel>();
    priceListItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [priceListItems]);

  const handleDeleteEntry = (entry: TimeEntryModel) => {
    Alert.alert(LL.timeTracking.deleteEntry(), LL.timeTracking.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTimeEntry(entry.id);
          } catch (error) {
            Alert.alert(
              LL.common.error(),
              getControlErrorMessage(LL.timeTracking.errorUpdateEntry(), error),
            );
          }
        },
      },
    ]);
  };

  const handleEditEntry = (entry: TimeEntryModel) => {
    if (editBasePath === 'clients') {
      router.push(`/clients/time-entry/${entry.id}/edit`);
      return;
    }
    router.push(`/time-tracking/entry/${entry.id}/edit`);
  };

  const handlePauseResumeAction = async () => {
    if (!runningEntry || !canControlRunningEntry) return;
    try {
      if (runningEntry.isPaused) {
        await resumeTimeEntry(runningEntry.id);
      } else {
        await pauseTimeEntry(runningEntry.id);
      }
    } catch (error) {
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(
          runningEntry.isPaused
            ? LL.timeTracking.errorResumeTimer()
            : LL.timeTracking.errorPauseTimer(),
          error,
        ),
      );
    }
  };

  const handleStopAction = async () => {
    if (!runningEntry || !canControlRunningEntry) return;
    try {
      await stopTimeEntry(runningEntry.id);
    } catch (error) {
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorStopTimer(), error),
      );
    }
  };

  const handleCreateTimesheet = async (payload: {
    periodType:
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
    periodFrom?: number;
    periodTo?: number;
    label?: string;
  }) => {
    if (!client) return;

    const result = await createTimesheetFromPeriod({ clientId: client.id, ...payload });

    if (result.entriesCount === 0) {
      Alert.alert(LL.timesheets.title(), LL.timesheets.noEntriesInPeriod());
      return;
    }

    if (result.timesheet?.id) {
      router.push(`/timesheets/timesheet/${result.timesheet.id}`);
      return;
    }

    Alert.alert(LL.common.success(), LL.timesheets.createdCount({ count: result.entriesCount }));
  };

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: `${client.name} – ${LL.timeTracking.title()}`,
          headerRight: () => (
            <HeaderActions>
              <IconButton
                iconName="person.3.fill"
                iconSize={18}
                onPress={() => router.push(`/clients/detail/${client.id}`)}
                accessibilityLabel={LL.timeTracking.clientDetail()}
              />
            </HeaderActions>
          ),
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
                      {client.name}
                    </Text>
                  )}
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={styles.timerActionSection}>
        {runningEntry ? (
          canControlRunningEntry ? (
            <PauseStopTimerControl
              entry={runningEntry}
              client={localRunningEntry ? client : undefined}
              defaultBillingInterval={defaultBillingInterval}
              onPauseResume={handlePauseResumeAction}
              onStop={handleStopAction}
              maxWidth={380}
            />
          ) : (
            <View
              style={[
                styles.timerStatusPanel,
                {
                  backgroundColor: palette.cardBackground,
                  borderColor: palette.border,
                },
              ]}
            >
              <IconSymbol name="lock.fill" size={18} color={palette.textSecondary} />
              <ThemedText
                style={[styles.timerStatusText, { color: palette.textSecondary }]}
                numberOfLines={2}
              >
                {LL.timeTracking.runningOnOtherDevice({
                  device:
                    runningEntry.runningDeviceName ||
                    runningEntry.runningDeviceId ||
                    LL.timeTracking.unknownDevice(),
                })}
              </ThemedText>
            </View>
          )
        ) : hasRunningEntryElsewhere ? (
          <View
            style={[
              styles.timerStatusPanel,
              {
                backgroundColor: palette.cardBackground,
                borderColor: palette.border,
              },
            ]}
          >
            <IconSymbol name="lock.fill" size={18} color={palette.textSecondary} />
            <ThemedText
              style={[styles.timerStatusText, { color: palette.textSecondary }]}
              numberOfLines={2}
            >
              {LL.timeTracking.errorRunningTimerAlreadyExists()}
            </ThemedText>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.startActionButton,
              { backgroundColor: palette.tint },
              pressed && styles.actionPressed,
            ]}
            onPress={() => setShowStartModal(true)}
            accessibilityRole="button"
            accessibilityLabel={LL.timeTracking.startTimer()}
          >
            <IconSymbol name="play.fill" size={20} color={palette.onTint} />
            <ThemedText style={[styles.startActionButtonText, { color: palette.onTint }]}>
              {LL.timeTracking.startTimer()}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={({ pressed }) => [
            styles.timesheetActionButton,
            {
              backgroundColor: palette.cardBackground,
              borderColor: palette.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
          onPress={() => setShowTimesheetModal(true)}
          accessibilityRole="button"
          accessibilityLabel={LL.timesheets.createToolbarAction()}
        >
          <IconSymbol name="doc.badge.plus" size={16} color={palette.tint} />
          <ThemedText style={[styles.timesheetActionText, { color: palette.tint }]}>
            {LL.timesheets.createToolbarAction()}
          </ThemedText>
        </Pressable>
      </View>

      <SwipeableList
        iconName="clock"
        title={LL.timeTracking.entries()}
        items={entries}
        onDelete={handleDeleteEntry}
        onEdit={handleEditEntry}
        keyExtractor={(item) => item.id}
        emptyText={LL.timeTracking.noEntries()}
        swipeHintKey="time-tracking.entries"
        swipeHintText={LL.timeTracking.swipeActionsHint()}
        emptyState={
          <ActionEmptyState
            iconName="clock.fill"
            title={LL.common.nothingHereYetTitle()}
            description={LL.timeTracking.noEntries()}
            actionLabel={canStartTimer ? LL.timeTracking.startTimer() : undefined}
            onActionPress={canStartTimer ? () => setShowStartModal(true) : undefined}
          />
        }
        showAddButton={false}
        renderItem={(item) => {
          const duration = getDisplayedTimeEntryDuration(item, nowMs);
          const billableDuration = roundTimeByInterval(duration, client, defaultBillingInterval);
          const showBillingTime =
            hasEffectiveBillingInterval(client, defaultBillingInterval) &&
            billableDuration !== duration;
          const date = new Date(item.startTime);
          const linkedPriceItem = item.priceListItemId
            ? priceListById.get(item.priceListItemId)
            : undefined;

          return (
            <View style={styles.itemContent}>
              <View style={styles.itemMain}>
                <View style={styles.itemTitleRow}>
                  <ThemedText
                    type="defaultSemiBold"
                    style={!item.description ? styles.mutedTitle : undefined}
                  >
                    {item.description || '-'}
                  </ThemedText>
                  {item.isRunning && (
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: item.isPaused
                            ? palette.timerPause
                            : palette.timeHighlight,
                        },
                      ]}
                    >
                      <ThemedText style={[styles.statusText, { color: palette.onTint }]}>
                        {item.isPaused ? LL.timeTracking.paused() : LL.timeTracking.running()}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {linkedPriceItem && item.rate !== undefined && (
                  <ThemedText style={styles.metaText}>
                    {linkedPriceItem.name} •{' '}
                    {formatPrice(
                      item.rate,
                      normalizeCurrencyCode(
                        item.rateCurrency,
                        linkedPriceItem.defaultPriceCurrency || defaultInvoiceCurrency,
                      ),
                      intlLocale,
                    )}{' '}
                    / {getUnitLabel(linkedPriceItem.unit)}
                  </ThemedText>
                )}

                <ThemedText style={styles.metaText}>
                  {date.toLocaleDateString(intlLocale)}{' '}
                  {date.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })}
                </ThemedText>
              </View>

              <View style={styles.durationWrap}>
                {showBillingTime ? (
                  <>
                    <ThemedText style={[styles.durationText, { color: palette.timeHighlight }]}>
                      {formatTime(billableDuration)}
                    </ThemedText>
                    <ThemedText style={styles.metaText}>{formatTime(duration)}</ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.durationText}>{formatTime(duration)}</ThemedText>
                )}
              </View>
            </View>
          );
        }}
      />

      <CreateTimesheetModal
        visible={showTimesheetModal}
        clientName={client.name}
        onClose={() => setShowTimesheetModal(false)}
        onCreate={handleCreateTimesheet}
      />

      <StartTimerModal
        visible={showStartModal}
        onClose={() => setShowStartModal(false)}
        clients={[client]}
        priceListItems={priceListItems}
        fixedClientId={client.id}
        fixedClientName={client.name}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  timesheetActionButton: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
  },
  timesheetActionText: { fontSize: 14, fontWeight: '600' },
  headerBackButton: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 160 },
  headerBackLabel: { fontSize: 17 },
  timerActionSection: { marginTop: 12, marginBottom: 10 },
  startActionButton: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionPressed: { opacity: 0.82 },
  startActionButtonText: { fontSize: 16, fontWeight: '700' },
  timerStatusPanel: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  timerStatusText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  itemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  itemMain: { flex: 1, gap: 2 },
  itemTitleRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  mutedTitle: { opacity: 0.55 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700' },
  metaText: { fontSize: 12, opacity: 0.65 },
  durationWrap: { alignItems: 'flex-end', minWidth: 74 },
  durationText: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
