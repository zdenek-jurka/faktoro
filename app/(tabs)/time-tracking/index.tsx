import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ClientTimeGroup } from '@/components/time-tracking/client-time-group';
import { PauseStopTimerControl } from '@/components/time-tracking/pause-stop-timer-control';
import { StartTimerModal } from '@/components/time-tracking/start-timer-modal';
import { TimeEntryFormModal } from '@/components/time-tracking/time-entry-form-modal';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { Colors } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useHeaderSearch } from '@/hooks/use-header-search';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { AppSettingsModel, ClientModel, PriceListItemModel, TimeEntryModel } from '@/model';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getPriceListItems } from '@/repositories/price-list-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  deleteTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
  updateTimeEntry,
} from '@/repositories/time-entry-repository';
import { isAndroid, isIos } from '@/utils/platform';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';
import { syncTimerToWidget } from '@/widgets/timer-widget-sync';
import { Q } from '@nozbe/watermelondb';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

export default function TimeTrackingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();
  const [runningEntries, setRunningEntries] = useState<TimeEntryModel[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryModel[]>([]);
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | undefined>();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);

  // Form state
  const [showStartModal, setShowStartModal] = useState(false);

  // Edit form state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryModel | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editPriceListItemId, setEditPriceListItemId] = useState<string>('');
  const localRunningClient = useMemo(() => {
    if (!localRunningEntry) return undefined;
    return clients.find((client) => client.id === localRunningEntry.clientId);
  }, [localRunningEntry, clients]);

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
    const loadDevice = async () => {
      const settings = await getSettings();
      setDefaultBillingInterval(settings.defaultBillingInterval);
      const deviceSettings = await getDeviceSyncSettings(settings);
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    };
    void loadDevice();

    const settingsSubscription = database
      .get<AppSettingsModel>(AppSettingsModel.table)
      .query()
      .observeWithColumns(['default_billing_interval'])
      .subscribe((allSettings) => {
        if (allSettings.length === 0) {
          setDefaultBillingInterval(undefined);
          return;
        }
        setDefaultBillingInterval(allSettings[0].defaultBillingInterval);
      });

    const deviceSubscription = observeDeviceSyncSettings((deviceSettings) => {
      setLocalDeviceId(deviceSettings.syncDeviceId || null);
    });

    return () => {
      settingsSubscription.unsubscribe();
      deviceSubscription();
    };
  }, []);

  // Load price list items
  useEffect(() => {
    const subscription = getPriceListItems(false).observe().subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  // Load time entries
  useEffect(() => {
    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('timesheet_id', null), Q.sortBy('start_time', Q.desc))
      .observe()
      .subscribe(setTimeEntries);

    return () => subscription.unsubscribe();
  }, []);

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
    setEditingEntry(currentEntry);
    setEditDescription(currentEntry.description ?? '');
    setEditPriceListItemId(currentEntry.priceListItemId || '');
    setShowEditModal(true);
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
              getControlErrorMessage(LL.timeTracking.errorStopTimer(), error),
            );
          }
        },
      },
    ]);
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry) {
      Alert.alert(LL.common.error(), LL.timeTracking.errorSelectClient());
      return;
    }

    try {
      let rate: number | null = null;
      let rateCurrency: string | null = null;

      // If a price list item is selected, get the effective price
      if (editPriceListItemId) {
        const effectiveRate = await getEffectivePriceDetails(
          editingEntry.clientId,
          editPriceListItemId,
        );
        rate = effectiveRate.price;
        rateCurrency = effectiveRate.currency;
      }

      await updateTimeEntry({
        id: editingEntry.id,
        description: editDescription.trim() || undefined,
        priceListItemId: editPriceListItemId || null,
        rate,
        rateCurrency,
      });

      setShowEditModal(false);
      setEditingEntry(null);
      setEditDescription('');
      setEditPriceListItemId('');
    } catch (error) {
      console.error('Error updating entry:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorUpdateEntry(), error),
      );
    }
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
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groupedEntries;

    return groupedEntries.filter(({ client }) => {
      const name = client.name.toLowerCase();
      const companyId = (client.companyId ?? '').toLowerCase();
      const email = (client.email ?? '').toLowerCase();
      return name.includes(query) || companyId.includes(query) || email.includes(query);
    });
  }, [groupedEntries, searchQuery]);

  const currentClient = useMemo(() => {
    if (!currentEntry) return undefined;
    return clients.find((client) => client.id === currentEntry.clientId);
  }, [currentEntry, clients]);

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

  const currentPriceListItem = useMemo(() => {
    if (!currentEntry?.priceListItemId) return undefined;
    return priceListItems.find((item) => item.id === currentEntry.priceListItemId);
  }, [currentEntry, priceListItems]);

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
      <KeyboardAvoidingView style={styles.container} behavior={isIos ? 'padding' : undefined}>
        {/* Timer Display */}
        <ThemedView style={styles.timerContainer}>
          {currentEntry && (
            <SwipeableRow
              onEdit={canControlCurrentEntry ? handleEditRunningEntry : undefined}
              onDelete={canControlCurrentEntry ? handleDeleteRunningEntry : undefined}
              borderRadius={12}
            >
              <View
                style={[
                  styles.currentInfoCard,
                  {
                    backgroundColor:
                      Colors[(colorScheme ?? 'light') as 'light' | 'dark'].cardBackground,
                    borderColor: Colors[(colorScheme ?? 'light') as 'light' | 'dark'].border,
                  },
                ]}
              >
                <View style={styles.currentInfoRow}>
                  <ThemedText style={styles.currentInfoClient} numberOfLines={1}>
                    {currentClient?.name ?? '-'}
                  </ThemedText>
                  {(!!currentEntry.description || !!currentPriceListItem) && (
                    <ThemedText style={styles.currentInfoSeparator}>·</ThemedText>
                  )}
                  {!!currentEntry.description && (
                    <ThemedText style={styles.currentInfoMeta} numberOfLines={1}>
                      {currentEntry.description}
                    </ThemedText>
                  )}
                  {!!currentPriceListItem && (
                    <>
                      {!!currentEntry.description && (
                        <ThemedText style={styles.currentInfoSeparator}>·</ThemedText>
                      )}
                      <IconSymbol
                        name="tag.fill"
                        size={11}
                        color={Colors[(colorScheme ?? 'light') as 'light' | 'dark'].timeHighlight}
                      />
                      <ThemedText style={styles.currentInfoMeta} numberOfLines={1}>
                        {currentPriceListItem.name}
                        {currentEntry.rate !== undefined
                          ? ` · ${formatPrice(
                              currentEntry.rate,
                              normalizeCurrencyCode(
                                currentEntry.rateCurrency,
                                currentPriceListItem.defaultPriceCurrency || defaultInvoiceCurrency,
                              ),
                              intlLocale,
                            )}`
                          : ''}
                      </ThemedText>
                    </>
                  )}
                </View>
                {!canControlCurrentEntry && (
                  <ThemedText style={styles.currentInfoRemote} numberOfLines={1}>
                    {LL.timeTracking.runningOnOtherDevice({
                      device:
                        currentEntry.runningDeviceName ||
                        currentEntry.runningDeviceId ||
                        LL.timeTracking.unknownDevice(),
                    })}
                  </ThemedText>
                )}
              </View>
            </SwipeableRow>
          )}

          <View style={styles.timerButtons}>
            {!localRunningEntry ? (
              clients.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.startButton,
                    { backgroundColor: Colors[(colorScheme ?? 'light') as 'light' | 'dark'].tint },
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => setShowStartModal(true)}
                >
                  <IconSymbol
                    name="play.fill"
                    size={22}
                    color={Colors[(colorScheme ?? 'light') as 'light' | 'dark'].onTint}
                  />
                  <ThemedText
                    style={[
                      styles.buttonText,
                      { color: Colors[(colorScheme ?? 'light') as 'light' | 'dark'].onTint },
                    ]}
                  >
                    {LL.timeTracking.start()}
                  </ThemedText>
                </Pressable>
              ) : (
                <NoClientsRequiredNotice
                  message={LL.timeTracking.addClientFirst()}
                  style={styles.noClientsNotice}
                />
              )
            ) : (
              <PauseStopTimerControl
                entry={localRunningEntry}
                client={localRunningClient}
                defaultBillingInterval={defaultBillingInterval}
                onPauseResume={localRunningEntry.isPaused ? handleResumeTimer : handlePauseTimer}
                onStop={handleStopTimer}
              />
            )}
          </View>
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
      />

      <TimeEntryFormModal
        visible={showEditModal}
        mode="edit"
        title={LL.timeTracking.editTimer()}
        submitLabel={LL.common.save()}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdateEntry}
        clients={clients}
        selectedClientId={editingEntry?.clientId}
        fixedClientName={
          editingEntry
            ? (clients.find((c) => c.id === editingEntry.clientId)?.name ?? '')
            : undefined
        }
        description={editDescription}
        onDescriptionChange={setEditDescription}
        priceListItems={priceListItems}
        selectedPriceListItemId={editPriceListItemId}
        onPriceListItemChange={setEditPriceListItemId}
        disableSubmit={!editingEntry}
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
  currentInfoCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    overflow: 'hidden',
    borderWidth: 1,
    gap: 3,
  },
  currentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  currentInfoClient: {
    fontSize: 13,
    fontWeight: '600',
  },
  currentInfoSeparator: {
    fontSize: 12,
    opacity: 0.35,
  },
  currentInfoMeta: {
    fontSize: 13,
    opacity: 0.6,
    flexShrink: 1,
  },
  currentInfoRemote: {
    fontSize: 11,
    opacity: 0.5,
    fontStyle: 'italic',
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
