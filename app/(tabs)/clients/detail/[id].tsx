import { ClientAddressSection } from '@/components/clients/client-address-section';
import { ClientPriceOverrideSection } from '@/components/clients/client-price-override-section';
import { EmailLink } from '@/components/email-link';
import { PhoneLink } from '@/components/phone-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PauseStopTimerControl } from '@/components/time-tracking/pause-stop-timer-control';
import { RemoteRunningTimerStatus } from '@/components/time-tracking/remote-running-timer-status';
import { StartTimerModal } from '@/components/time-tracking/start-timer-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { IconButton } from '@/components/ui/icon-button';
import { BorderRadius, FontSizes, Opacity, Spacing } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  ClientModel,
  InvoiceModel,
  PriceListItemModel,
  TimeEntryModel,
  TimesheetModel,
} from '@/model';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getPriceListItems } from '@/repositories/price-list-repository';
import { getSettings, observeSettings } from '@/repositories/settings-repository';
import {
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
} from '@/repositories/time-entry-repository';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Pressable, View } from 'react-native';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = usePalette();
  const { LL } = useI18nContext();
  const [client, setClient] = useState<ClientModel | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [runningEntriesForClient, setRunningEntriesForClient] = useState<TimeEntryModel[]>([]);
  const [hasRunningEntryElsewhere, setHasRunningEntryElsewhere] = useState(false);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [defaultBillingInterval, setDefaultBillingInterval] = useState<number | undefined>();
  const [timesheetCount, setTimesheetCount] = useState<number>(0);
  const [timeEntryCount, setTimeEntryCount] = useState<number>(0);
  const [invoiceCount, setInvoiceCount] = useState<number>(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [headerTitle, setHeaderTitle] = useState('');
  const nameSectionHeight = useRef(0);

  const getControlErrorMessage = (fallback: string, error: unknown) => {
    if (error instanceof Error && error.message === 'TIME_ENTRY_REMOTE_CONTROL_FORBIDDEN') {
      return LL.timeTracking.errorControlOtherDevice();
    }
    return fallback;
  };

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const threshold = nameSectionHeight.current || 64;
      setHeaderTitle(value > threshold ? (client?.name ?? '') : '');
    });
    return () => scrollY.removeListener(listenerId);
  }, [scrollY, client?.name]);

  useEffect(() => {
    if (!id) return;

    const loadClient = async () => {
      const clients = database.get<ClientModel>(ClientModel.table);
      const clientData = await clients.find(id);
      setClient(clientData);
    };

    loadClient();

    // Subscribe to client changes
    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(id)
      .subscribe(setClient);

    return () => subscription.unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const timesheetSub = database
      .get<TimesheetModel>(TimesheetModel.table)
      .query(Q.where('client_id', id))
      .observeCount()
      .subscribe(setTimesheetCount);

    const timeEntrySub = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('client_id', id), Q.where('is_running', false))
      .observeCount()
      .subscribe(setTimeEntryCount);

    const invoiceSub = database
      .get<InvoiceModel>(InvoiceModel.table)
      .query(Q.where('client_id', id))
      .observeCount()
      .subscribe(setInvoiceCount);

    return () => {
      timesheetSub.unsubscribe();
      timeEntrySub.unsubscribe();
      invoiceSub.unsubscribe();
    };
  }, [id]);

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
    if (!id) return;

    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('is_running', true))
      .observeWithColumns([
        'client_id',
        'is_paused',
        'paused_at',
        'total_paused_duration',
        'running_device_id',
        'running_device_name',
      ])
      .subscribe((entries) => {
        const runningInOtherClient = entries.some((entry) => {
          const isLocal =
            !entry.runningDeviceId || (!!localDeviceId && entry.runningDeviceId === localDeviceId);
          return isLocal && entry.clientId !== id;
        });
        setHasRunningEntryElsewhere(runningInOtherClient);
      });

    return () => subscription.unsubscribe();
  }, [id, localDeviceId]);

  useEffect(() => {
    if (runningEntriesForClient.length === 0) return;

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [runningEntriesForClient.length]);

  useEffect(() => {
    const subscription = getPriceListItems(false)
      .observeWithColumns(['name', 'default_price', 'default_price_currency', 'unit', 'is_active'])
      .subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;

    const subscription = database
      .get<TimeEntryModel>(TimeEntryModel.table)
      .query(Q.where('client_id', id), Q.where('is_running', true))
      .observeWithColumns([
        'is_paused',
        'paused_at',
        'total_paused_duration',
        'running_device_id',
        'running_device_name',
      ])
      .subscribe(setRunningEntriesForClient);

    return () => subscription.unsubscribe();
  }, [id, localDeviceId]);

  const localRunningEntry = useMemo(() => {
    if (!localDeviceId) {
      return runningEntriesForClient.find((entry) => !entry.runningDeviceId) ?? null;
    }
    return runningEntriesForClient.find((entry) => entry.runningDeviceId === localDeviceId) ?? null;
  }, [localDeviceId, runningEntriesForClient]);

  const remoteRunningEntry = useMemo(
    () =>
      runningEntriesForClient.find((entry) => {
        if (!entry.runningDeviceId) return false;
        return !localDeviceId || entry.runningDeviceId !== localDeviceId;
      }) ?? null,
    [localDeviceId, runningEntriesForClient],
  );

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMainTimerAction = async () => {
    if (hasRunningEntryElsewhere) return;
    setShowStartModal(true);
  };

  const handlePauseResumeAction = async () => {
    if (!localRunningEntry) return;

    try {
      if (localRunningEntry.isPaused) {
        await resumeTimeEntry(localRunningEntry.id);
      } else {
        await pauseTimeEntry(localRunningEntry.id);
      }
    } catch (error) {
      console.error('Error toggling pause from client detail:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(
          localRunningEntry.isPaused
            ? LL.timeTracking.errorResumeTimer()
            : LL.timeTracking.errorPauseTimer(),
          error,
        ),
      );
    }
  };

  const handleStopAction = async () => {
    if (!localRunningEntry) return;

    try {
      await stopTimeEntry(localRunningEntry.id);
    } catch (error) {
      console.error('Error stopping timer from client detail:', error);
      Alert.alert(
        LL.common.error(),
        getControlErrorMessage(LL.timeTracking.errorStopTimer(), error),
      );
    }
  };

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: LL.common.loading() }} />
        <ThemedText>{LL.common.loading()}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerBackTitle: LL.clients.title(),
          headerRight: () => (
            <IconButton
              iconName="pencil"
              iconSize={18}
              onPress={() => router.push(`/clients/edit/${id}`)}
              accessibilityLabel={LL.common.edit()}
            />
          ),
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={contentStyle}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        {/* Client name and company badge */}
        <View
          style={styles.nameSection}
          onLayout={(e) => {
            nameSectionHeight.current = e.nativeEvent.layout.height;
          }}
        >
          <Animated.Text
            style={[
              styles.name,
              {
                color: palette.text,
                fontSize: scrollY.interpolate({
                  inputRange: [0, 100],
                  outputRange: [FontSizes['3xl'], FontSizes.xl],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            {client.name}
          </Animated.Text>
          {client.isCompany && (
            <Animated.View
              style={[
                styles.companyBadge,
                { backgroundColor: palette.infoBadgeBackground },
                {
                  opacity: scrollY.interpolate({
                    inputRange: [0, 80],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: scrollY.interpolate({
                        inputRange: [0, 80],
                        outputRange: [1, 0.8],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <ThemedText style={[styles.companyBadgeText, { color: palette.infoBadgeText }]}>
                {LL.clients.company()}
              </ThemedText>
            </Animated.View>
          )}
        </View>

        <View style={styles.startActionSection}>
          {localRunningEntry ? (
            <PauseStopTimerControl
              entry={localRunningEntry}
              client={client}
              defaultBillingInterval={defaultBillingInterval}
              title={client.name}
              onPauseResume={handlePauseResumeAction}
              onStop={handleStopAction}
              maxWidth={380}
            />
          ) : (
            <Pressable
              style={[
                styles.startActionButton,
                {
                  backgroundColor: hasRunningEntryElsewhere
                    ? colorScheme === 'dark'
                      ? palette.textSecondary
                      : palette.textSecondary
                    : palette.tint,
                },
              ]}
              onPress={handleMainTimerAction}
              disabled={hasRunningEntryElsewhere}
              accessibilityRole="button"
              accessibilityLabel={LL.timeTracking.startTimer()}
            >
              <IconSymbol name="play.fill" size={18} color={palette.onTint} />
              <View
                style={[
                  styles.startActionButtonTextBlock,
                  hasRunningEntryElsewhere && styles.disabledStartButtonContent,
                ]}
              >
                <ThemedText style={[styles.startActionButtonText, { color: palette.onTint }]}>
                  {LL.timeTracking.startTimer()}
                </ThemedText>
              </View>
            </Pressable>
          )}

          {remoteRunningEntry ? (
            <RemoteRunningTimerStatus
              style={styles.remoteTimerStatus}
              label={LL.timeTracking.runningOnOtherDevice({
                device:
                  remoteRunningEntry.runningDeviceName ||
                  remoteRunningEntry.runningDeviceId ||
                  LL.timeTracking.unknownDevice(),
              })}
              duration={formatTime(getDisplayedTimeEntryDuration(remoteRunningEntry, nowMs))}
            />
          ) : null}
        </View>

        <View style={[styles.toolbar, { backgroundColor: palette.cardBackground }]}>
          {[
            {
              iconName: 'doc.text.fill' as const,
              label: LL.timesheets.title(),
              count: timesheetCount,
              onPress: () =>
                router.push({
                  pathname: '/clients/timesheets/[id]',
                  params: { id: client.id },
                }),
            },
            {
              iconName: 'clock.fill' as const,
              label: LL.timesheets.entriesSectionTitle(),
              count: timeEntryCount,
              onPress: () =>
                router.push({
                  pathname: '/clients/time-tracking/[id]',
                  params: { id: client.id },
                }),
            },
            {
              iconName: 'doc.richtext.fill' as const,
              label: LL.invoices.title(),
              count: invoiceCount,
              onPress: () =>
                router.push({
                  pathname: '/clients/invoices/[id]',
                  params: { id: client.id },
                }),
            },
          ].map((item, index, arr) => (
            <View key={item.label}>
              <Pressable
                style={({ pressed }) => [styles.toolbarRow, pressed && styles.toolbarRowPressed]}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View
                  style={[styles.toolbarIconBadge, { backgroundColor: palette.backgroundSubtle }]}
                >
                  <IconSymbol name={item.iconName} size={18} color={palette.timeHighlight} />
                </View>
                <ThemedText style={styles.toolbarRowLabel}>{item.label}</ThemedText>
                {item.count > 0 && (
                  <ThemedText style={[styles.toolbarRowCount, { color: palette.textSecondary }]}>
                    {item.count}
                  </ThemedText>
                )}
                <IconSymbol name="chevron.right" size={14} color={palette.icon} />
              </Pressable>
              {index < arr.length - 1 && (
                <View style={[styles.toolbarDivider, { backgroundColor: palette.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* Details Section */}
        <ThemedView style={styles.section}>
          {(client.companyId || client.vatNumber) && (
            <View style={[styles.infoBox, { backgroundColor: palette.cardBackground }]}>
              {client.companyId && client.vatNumber ? (
                <View style={styles.twoColumnRow}>
                  <View style={styles.column}>
                    <View style={styles.detailTextContainer}>
                      <ThemedText style={styles.detailValue}>{client.companyId}</ThemedText>
                      <ThemedText style={styles.detailLabel}>
                        {LL.clients.companyIdLabel()}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.column}>
                    <View style={styles.detailTextContainer}>
                      <ThemedText style={[styles.detailValue, styles.textRight]}>
                        {client.vatNumber}
                      </ThemedText>
                      <ThemedText style={[styles.detailLabel, styles.textRight]}>
                        {LL.clients.vatNumberLabel()}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ) : (
                <>
                  {client.companyId && (
                    <View style={styles.detailTextContainer}>
                      <ThemedText style={styles.detailValue}>{client.companyId}</ThemedText>
                      <ThemedText style={styles.detailLabel}>
                        {LL.clients.companyIdLabel()}
                      </ThemedText>
                    </View>
                  )}
                  {client.vatNumber && (
                    <View style={styles.detailTextContainer}>
                      <ThemedText style={styles.detailValue}>{client.vatNumber}</ThemedText>
                      <ThemedText style={styles.detailLabel}>
                        {LL.clients.vatNumberLabel()}
                      </ThemedText>
                    </View>
                  )}
                </>
              )}
            </View>
          )}
          {client.email && (
            <View style={[styles.infoBox, { backgroundColor: palette.cardBackground }]}>
              <View style={styles.detailContent}>
                <View style={styles.iconContainer}>
                  <IconSymbol name="envelope" size={30} color={palette.icon} />
                </View>
                <View style={styles.detailTextContainer}>
                  <EmailLink email={client.email} />
                  <ThemedText style={styles.detailLabel}>{LL.clients.emailLabel()}</ThemedText>
                </View>
              </View>
            </View>
          )}
          {client.phone && (
            <View style={[styles.infoBox, { backgroundColor: palette.cardBackground }]}>
              <View style={styles.detailContent}>
                <View style={styles.iconContainer}>
                  <IconSymbol name="phone" size={30} color={palette.icon} />
                </View>
                <View style={styles.detailTextContainer}>
                  <PhoneLink phone={client.phone} />
                  <ThemedText style={styles.detailLabel}>{LL.clients.phoneLabel()}</ThemedText>
                </View>
              </View>
            </View>
          )}
          {client.notes && (
            <View style={[styles.infoBox, { backgroundColor: palette.cardBackground }]}>
              <View style={styles.detailContent}>
                <View style={styles.iconContainer}>
                  <IconSymbol name="note.text" size={30} color={palette.icon} />
                </View>
                <View style={styles.detailTextContainer}>
                  <ThemedText style={styles.detailValue}>{client.notes}</ThemedText>
                  <ThemedText style={styles.detailLabel}>{LL.clients.notesLabel()}</ThemedText>
                </View>
              </View>
            </View>
          )}
        </ThemedView>

        {/* Addresses Section */}
        <ThemedView style={styles.addressesSection}>
          <ClientAddressSection client={client} />
        </ThemedView>

        {/* Price Overrides Section */}
        <ThemedView style={styles.priceOverridesSection}>
          <ClientPriceOverrideSection client={client} />
        </ThemedView>
      </Animated.ScrollView>

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
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  nameSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  name: {
    fontSize: FontSizes['3xl'],
    fontWeight: 'bold',
    textAlign: 'center',
  },
  companyBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    alignSelf: 'center',
  },
  companyBadgeText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  startActionSection: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toolbar: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
  },
  toolbarRowPressed: {
    opacity: 0.6,
  },
  toolbarIconBadge: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarRowLabel: {
    flex: 1,
    fontSize: FontSizes.base,
    fontWeight: '500',
  },
  toolbarRowCount: {
    fontSize: FontSizes.sm,
    marginRight: 4,
  },
  toolbarDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.md + 36 + Spacing.md,
  },
  startActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
  },
  startActionButtonText: {
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  startActionButtonTextBlock: {
    alignItems: 'center',
  },
  disabledStartButtonContent: {
    opacity: Opacity.muted,
  },
  remoteTimerStatus: { maxWidth: 380 },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  addressesSection: {
    marginTop: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  priceOverridesSection: {
    marginTop: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  infoBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  detailRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  twoColumnRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  column: {
    flex: 1,
  },
  detailContent: {
    flexDirection: 'row',
  },
  iconContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextContainer: {
    flex: 1,
    gap: 0,
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    opacity: Opacity.muted,
    lineHeight: FontSizes.sm,
  },
  detailValue: {
    fontSize: FontSizes.base,
  },
  textRight: {
    textAlign: 'right',
  },
});
