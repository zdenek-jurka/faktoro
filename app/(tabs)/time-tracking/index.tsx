import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ClientTimeGroup } from '@/components/time-tracking/client-time-group';
import { PauseStopTimerControl } from '@/components/time-tracking/pause-stop-timer-control';
import { RemoteRunningTimerStatus } from '@/components/time-tracking/remote-running-timer-status';
import { StartTimerModal } from '@/components/time-tracking/start-timer-modal';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useHeaderSearch } from '@/hooks/use-header-search';
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
import { buildClientIdentitySearchClause } from '@/utils/client-search';
import { isAndroid, isIos } from '@/utils/platform';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import { syncTimerToWidget } from '@/widgets/timer-widget-sync';
import { Q } from '@nozbe/watermelondb';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

export default function TimeTrackingScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();
  const [runningEntries, setRunningEntries] = useState<TimeEntryModel[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryModel[]>([]);
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [matchingClientIds, setMatchingClientIds] = useState<Set<string> | null>(null);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | undefined>();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);
  const [nowMs, setNowMs] = useState(Date.now());

  // Form state
  const [showStartModal, setShowStartModal] = useState(false);

  const getControlErrorMessage = (fallback: string, error: unknown) => {
    if (error instanceof Error && error.message === 'TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN') {
      return LL.timeTracking.errorControlOtherDevice();
    }
    return fallback;
  };

  // Load clients
  useEffect(() => {
    const loadClients = async () => {
      const clientsCollection = database.get<ClientModel>(ClientModel.table);
      const allClients = await clientsCollection
        .query(Q.where('is_archived', false), Q.sortBy('name', Q.asc))
        .fetch();
      setClients(allClients);
    };
    loadClients();

    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .query(Q.where('is_archived', false), Q.sortBy('name', Q.asc))
      .observeWithColumns(['name', 'billing_interval_enabled', 'billing_interval_minutes'])
      .subscribe(setClients);

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const searchClause = buildClientIdentitySearchClause(searchQuery);
    if (!searchClause) {
      setMatchingClientIds(null);
      return;
    }

    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .query(Q.where('is_archived', false), searchClause)
      .observeWithColumns(['name', 'company_id', 'email'])
      .subscribe((matchingClients) => {
        setMatchingClientIds(new Set(matchingClients.map((client) => client.id)));
      });

    return () => subscription.unsubscribe();
  }, [searchQuery]);

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

  // Load price list items
  useEffect(() => {
    const subscription = getPriceListItems(false)
      .observeWithColumns(['name', 'default_price', 'default_price_currency', 'unit', 'is_active'])
      .subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  // Load time entries
  useEffect(() => {
    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', null), Q.sortBy('start_time', Q.desc))
      .observeWithColumns([
        'timesheet_id',
        'client_id',
        'start_time',
        'duration',
        'is_running',
        'is_paused',
        'paused_at',
        'total_paused_duration',
      ])
      .subscribe(setTimeEntries);

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (runningEntries.length === 0) return;

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [runningEntries.length]);

  // Observe running entry
  useEffect(() => {
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
      .subscribe(setRunningEntries);

    return () => subscription.unsubscribe();
  }, []);

  const localRunningEntry = useMemo(() => {
    if (!localDeviceId) {
      return runningEntries.find((entry) => !entry.runningDeviceId) ?? null;
    }
    return runningEntries.find((entry) => entry.runningDeviceId === localDeviceId) ?? null;
  }, [localDeviceId, runningEntries]);

  const localRunningClient = useMemo(() => {
    if (!localRunningEntry) return undefined;
    return clients.find((client) => client.id === localRunningEntry.clientId);
  }, [localRunningEntry, clients]);

  const remoteRunningEntry = useMemo(
    () =>
      runningEntries.find((entry) => {
        if (!entry.runningDeviceId) return false;
        return !localDeviceId || entry.runningDeviceId !== localDeviceId;
      }) ?? null,
    [localDeviceId, runningEntries],
  );

  const currentEntry = useMemo(
    () => localRunningEntry ?? (runningEntries.length > 0 ? runningEntries[0] : null),
    [localRunningEntry, runningEntries],
  );

  const canControlCurrentEntry = useMemo(() => {
    if (!currentEntry) return false;
    if (!currentEntry.runningDeviceId) return true;
    return !!localDeviceId && currentEntry.runningDeviceId === localDeviceId;
  }, [currentEntry, localDeviceId]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStopTimer = async () => {
    if (!currentEntry || !canControlCurrentEntry) return;

    try {
      await stopTimeEntry(currentEntry.id);
    } catch (error) {
      console.error('Error stopping timer:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorStopTimer(), error),
      );
    }
  };

  const handlePauseTimer = async () => {
    if (!currentEntry || !canControlCurrentEntry) return;

    try {
      await pauseTimeEntry(currentEntry.id);
      // Observable will automatically update currentEntry
    } catch (error) {
      console.error('Error pausing timer:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorPauseTimer(), error),
      );
    }
  };

  const handleResumeTimer = async () => {
    if (!currentEntry || !canControlCurrentEntry) return;

    try {
      await resumeTimeEntry(currentEntry.id);
      // Observable will automatically update currentEntry
    } catch (error) {
      console.error('Error resuming timer:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorResumeTimer(), error),
      );
    }
  };

  const handleEditRunningEntry = () => {
    if (!currentEntry || !canControlCurrentEntry) return;
    router.push(`/time-tracking/entry/${currentEntry.id}/edit`);
  };

  const handleDeleteRunningEntry = () => {
    if (!currentEntry || !canControlCurrentEntry) return;

    Alert.alert(LL.timeTracking.deleteEntry(), LL.timeTracking.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTimeEntry(currentEntry.id);
          } catch (error) {
            console.error('Error deleting running entry:', error);
            Alert.alert(
              LL.common.error(),
              getControlErrorMessage(LL.timeTracking.errorDeleteEntry(), error),
            );
          }
        },
      },
    ]);
  };

  // Group time entries by client
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { client: ClientModel; entries: TimeEntryModel[] }>();

    timeEntries.forEach((entry) => {
      const client = clients.find((c) => c.id === entry.clientId);
      if (client) {
        if (!groups.has(client.id)) {
          groups.set(client.id, { client, entries: [] });
        }
        groups.get(client.id)!.entries.push(entry);
      }
    });

    // Show only clients with records and keep client-like ordering by name.
    return Array.from(groups.values())
      .filter((group) => group.entries.length > 0)
      .sort((a, b) => a.client.name.localeCompare(b.client.name, intlLocale));
  }, [clients, intlLocale, timeEntries]);

  const filteredGroupedEntries = useMemo(() => {
    if (!matchingClientIds) return groupedEntries;
    return groupedEntries.filter(({ client }) => matchingClientIds.has(client.id));
  }, [groupedEntries, matchingClientIds]);

  const remoteRunningClient = useMemo(() => {
    if (!remoteRunningEntry) return undefined;
    return clients.find((client) => client.id === remoteRunningEntry.clientId);
  }, [clients, remoteRunningEntry]);

  // Keep the iOS widget in sync whenever the running entry or its client changes.
  // WatermelonDB reuses model instances (mutates fields in-place), so we must list
  // individual primitive fields as deps — otherwise React sees the same object
  // reference and skips the effect on pause/resume/field updates.
  useEffect(() => {
    syncTimerToWidget(localRunningEntry ?? null, localRunningClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    localRunningEntry?.id,
    localRunningEntry?.isRunning,
    localRunningEntry?.isPaused,
    localRunningEntry?.pausedAt,
    localRunningEntry?.totalPausedDuration,
    localRunningEntry?.startTime,
    localRunningClient?.id,
    localRunningClient?.name,
  ]);

  const localPriceListItem = useMemo(() => {
    if (!localRunningEntry?.priceListItemId) return undefined;
    return priceListItems.find((item) => item.id === localRunningEntry.priceListItemId);
  }, [localRunningEntry, priceListItems]);

  const localTimerDetail = useMemo(() => {
    if (!localRunningEntry) return '';
    const details: string[] = [];
    if (localRunningEntry.description) details.push(localRunningEntry.description);
    if (localPriceListItem) {
      const rateText =
        localRunningEntry.rate !== undefined
          ? ` · ${formatPrice(
              localRunningEntry.rate,
              normalizeCurrencyCode(
                localRunningEntry.rateCurrency,
                localPriceListItem.defaultPriceCurrency || defaultInvoiceCurrency,
              ),
              intlLocale,
            )}`
          : '';
      details.push(`${localPriceListItem.name}${rateText}`);
    }
    return details.join(' · ');
  }, [defaultInvoiceCurrency, intlLocale, localPriceListItem, localRunningEntry]);

  const remotePriceListItem = useMemo(() => {
    if (!remoteRunningEntry?.priceListItemId) return undefined;
    return priceListItems.find((item) => item.id === remoteRunningEntry.priceListItemId);
  }, [priceListItems, remoteRunningEntry]);

  const remoteTimerDetail = useMemo(() => {
    if (!remoteRunningEntry) return '';
    const details: string[] = [];
    if (remoteRunningEntry.description) details.push(remoteRunningEntry.description);
    if (remotePriceListItem) {
      const rateText =
        remoteRunningEntry.rate !== undefined
          ? ` · ${formatPrice(
              remoteRunningEntry.rate,
              normalizeCurrencyCode(
                remoteRunningEntry.rateCurrency,
                remotePriceListItem.defaultPriceCurrency || defaultInvoiceCurrency,
              ),
              intlLocale,
            )}`
          : '';
      details.push(`${remotePriceListItem.name}${rateText}`);
    }
    return details.join(' · ');
  }, [defaultInvoiceCurrency, intlLocale, remotePriceListItem, remoteRunningEntry]);

  const renderClientGroup = ({
    item,
  }: {
    item: { client: ClientModel; entries: TimeEntryModel[] };
  }) => {
    return (
      <SwipeableRow>
        <ClientTimeGroup
          client={item.client}
          entries={item.entries}
          defaultBillingInterval={defaultBillingInterval}
          formatTime={formatTime}
          onPress={(clientId) => router.push(`/time-tracking/client/${clientId}`)}
        />
      </SwipeableRow>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.timeTracking.title(),
          headerSearchBarOptions: getHeaderSearchBarOptions(LL.clients.searchPlaceholder()),
          headerRight: () => (
            <HeaderActions hidden={isAndroid && isSearchVisible}>
              {isIos && (
                <IconButton
                  iconName="magnifyingglass"
                  onPress={handleOpenSearch}
                  accessibilityLabel={LL.clients.searchPlaceholder()}
                />
              )}
            </HeaderActions>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        enabled={isIos}
      >
        {/* Timer Display */}
        <ThemedView style={styles.timerContainer}>
          <View style={styles.timerButtons}>
            {!localRunningEntry ? (
              clients.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.startButton,
                    { backgroundColor: palette.tint },
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => setShowStartModal(true)}
                >
                  <IconSymbol name="play.fill" size={22} color={palette.onTint} />
                  <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                    {LL.timeTracking.startTimer()}
                  </ThemedText>
                </Pressable>
              ) : (
                <NoClientsRequiredNotice
                  message={LL.timeTracking.addClientFirst()}
                  returnTo="timeTracking"
                  style={styles.noClientsNotice}
                />
              )
            ) : (
              <SwipeableRow
                onEdit={canControlCurrentEntry ? handleEditRunningEntry : undefined}
                onDelete={canControlCurrentEntry ? handleDeleteRunningEntry : undefined}
                borderRadius={12}
              >
                <PauseStopTimerControl
                  entry={localRunningEntry}
                  client={localRunningClient}
                  defaultBillingInterval={defaultBillingInterval}
                  title={localRunningClient?.name}
                  detail={localTimerDetail}
                  onPauseResume={localRunningEntry.isPaused ? handleResumeTimer : handlePauseTimer}
                  onStop={handleStopTimer}
                />
              </SwipeableRow>
            )}
          </View>

          {remoteRunningEntry ? (
            <RemoteRunningTimerStatus
              title={remoteRunningClient?.name ?? '-'}
              detail={remoteTimerDetail}
              label={LL.timeTracking.runningOnOtherDevice({
                device:
                  remoteRunningEntry.runningDeviceName ||
                  remoteRunningEntry.runningDeviceId ||
                  LL.timeTracking.unknownDevice(),
              })}
              duration={formatTime(getDisplayedTimeEntryDuration(remoteRunningEntry, nowMs))}
            />
          ) : null}
        </ThemedView>

        {/* Time Entries List */}
        <FlatList
          style={styles.list}
          contentContainerStyle={listContentStyle}
          data={filteredGroupedEntries}
          keyExtractor={(item) => item.client.id}
          renderItem={renderClientGroup}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustContentInsets={true}
          ListEmptyComponent={
            <ThemedView style={styles.emptyState}>
              <ActionEmptyState
                iconName={searchQuery.trim().length === 0 ? 'clock.fill' : 'magnifyingglass'}
                title={
                  searchQuery.trim().length === 0
                    ? LL.common.nothingHereYetTitle()
                    : LL.common.noResultsTitle()
                }
                description={
                  searchQuery.trim().length === 0
                    ? LL.timeTracking.noEntries()
                    : LL.clients.noClientsSearch()
                }
              />
            </ThemedView>
          }
        />
      </KeyboardAvoidingView>

      <StartTimerModal
        visible={showStartModal}
        onClose={() => setShowStartModal(false)}
        clients={clients}
        priceListItems={priceListItems}
        addClientReturnTo="timeTracking"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timerContainer: {
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  timerButtons: {
    width: '100%',
  },
  noClientsNotice: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  startButton: {
    // backgroundColor is set dynamically
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 16,
  },
});
