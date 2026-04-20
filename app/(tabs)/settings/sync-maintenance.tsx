import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { QrScannerModal } from '@/components/sync/qr-scanner-modal';
import { SyncPayloadEntryModal } from '@/components/sync/sync-payload-entry-modal';
import { BottomSheetFormModal } from '@/components/ui/bottom-sheet-form-modal';
import { Colors, FontSizes, Spacing } from '@/constants/theme';
import {
  isDangerousSyncResetEnabled,
  isSyncEnabled,
  isSyncRecoveryPayloadEntryEnabled,
} from '@/constants/features';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import SyncConflictModel from '@/model/SyncConflictModel';
import SyncOperationModel from '@/model/SyncOperationModel';
import {
  getDeviceSyncSettings,
  observeDeviceSyncSettings,
  updateDeviceSyncSettings,
} from '@/repositories/device-sync-settings-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  buildInstanceKeyBackupPayload,
  generateInstanceKey,
  isSecureCryptoAvailable,
  parseInstanceKeyBackupPayload,
} from '@/repositories/sync-crypto';
import {
  recoverSyncDeviceFromRawInput,
  upsertSyncRecoveryBootstrap,
} from '@/repositories/sync-recovery-repository';
import { getSyncErrorMessage } from '@/utils/error-utils';
import {
  resolveConflictWithMergedPayload,
  resolveConflictWithStrategy,
  type ConflictResolutionStrategy,
} from '@/repositories/sync-conflict-repository';
import {
  cleanupLocalOnlySyncArtifacts,
  dangerouslyClearLocalSyncQueueAndConflicts,
} from '@/repositories/sync-internal-metadata-repository';
import {
  createSnapshotBackup,
  forgetServerRegistration,
  restoreSnapshotBackup,
  runOnlineSyncSafely,
  touchAllSyncData,
} from '@/repositories/sync-repository';
import { extractRecoveryPayload, syncDebugLog } from '@/utils/sync-pairing-utils';
import { showAlert, showConfirm } from '@/utils/platform-alert';
import { isIos } from '@/utils/platform';
import { Q } from '@nozbe/watermelondb';
import { useCameraPermissions } from 'expo-camera';
import { Redirect, Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

export default function SyncMaintenanceScreen() {
  if (!isSyncEnabled) {
    return <Redirect href="/settings" />;
  }
  return <SyncMaintenanceScreenContent />;
}

function SyncMaintenanceScreenContent() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const supportsSecureCrypto = isSecureCryptoAvailable();

  const [syncInstanceId, setSyncInstanceId] = useState('');
  const [syncIsRegistered, setSyncIsRegistered] = useState(false);
  const [syncAllowPlaintext, setSyncAllowPlaintext] = useState(false);
  const [syncInstanceKey, setSyncInstanceKey] = useState('');
  const [syncingNow, setSyncingNow] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [keyBackupPayload, setKeyBackupPayload] = useState('');
  const [keyRestorePayload, setKeyRestorePayload] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [payloadEntryOpen, setPayloadEntryOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getSettings>> | null>(null);
  const [pendingOperations, setPendingOperations] = useState<SyncOperationModel[]>([]);
  const [pendingConflicts, setPendingConflicts] = useState<SyncConflictModel[]>([]);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [detailConflict, setDetailConflict] = useState<SyncConflictModel | null>(null);
  const [detailSelections, setDetailSelections] = useState<Record<string, 'local' | 'remote'>>({});

  useEffect(() => {
    const load = async () => {
      const appSettings = await getSettings();
      setSettings(appSettings);
      const ds = await getDeviceSyncSettings(appSettings);
      setSyncInstanceId(ds.syncInstanceId || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
    };
    void load();

    const unsub = observeDeviceSyncSettings((ds) => {
      setSyncInstanceId(ds.syncInstanceId || '');
      setSyncIsRegistered(ds.syncIsRegistered || false);
      setSyncAllowPlaintext(ds.syncAllowPlaintext || false);
      setSyncInstanceKey(ds.syncInstanceKey || '');
    });
    return unsub;
  }, []);

  useEffect(() => {
    const operationsSubscription = database
      .get<SyncOperationModel>(SyncOperationModel.table)
      .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.desc), Q.take(10))
      .observe()
      .subscribe(setPendingOperations);

    const conflictsSubscription = database
      .get<SyncConflictModel>(SyncConflictModel.table)
      .query(Q.where('status', 'pending'), Q.sortBy('created_at', Q.desc), Q.take(10))
      .observe()
      .subscribe(setPendingConflicts);

    return () => {
      operationsSubscription.unsubscribe();
      conflictsSubscription.unsubscribe();
    };
  }, []);

  const refreshPendingSyncState = async () => {
    const [operations, conflicts] = await Promise.all([
      database
        .get<SyncOperationModel>(SyncOperationModel.table)
        .query(Q.where('is_synced', false), Q.sortBy('created_at', Q.desc), Q.take(10))
        .fetch(),
      database
        .get<SyncConflictModel>(SyncConflictModel.table)
        .query(Q.where('status', 'pending'), Q.sortBy('created_at', Q.desc), Q.take(10))
        .fetch(),
    ]);

    setPendingOperations(operations);
    setPendingConflicts(conflicts);
  };

  const handleSyncNow = async () => {
    if (!settings) return;
    try {
      setSyncingNow(true);
      await runOnlineSyncSafely(settings);
      showAlert(LL.common.success(), LL.settings.syncOnlineSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleTouchAllData = async () => {
    if (!settings) return;
    const confirmed = await showConfirm({
      title: LL.settings.syncTouchAllDataConfirmTitle(),
      message: LL.settings.syncTouchAllDataConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncTouchAllDataConfirmContinue(),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setSyncingNow(true);
      await touchAllSyncData();
      const freshSettings = await getSettings();
      await runOnlineSyncSafely(freshSettings);
      showAlert(LL.common.success(), LL.settings.syncTouchAllDataSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!settings) return;
    try {
      setSyncingNow(true);
      await createSnapshotBackup(settings);
      showAlert(LL.common.success(), LL.settings.syncBackupCreateSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleCleanupLocalArtifacts = async () => {
    const confirmed = await showConfirm({
      title: LL.settings.syncCleanupLocalArtifactsConfirmTitle(),
      message: LL.settings.syncCleanupLocalArtifactsConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncCleanupLocalArtifactsConfirmContinue(),
      destructive: false,
    });
    if (!confirmed) return;

    try {
      setSyncingNow(true);
      await cleanupLocalOnlySyncArtifacts();
      await refreshPendingSyncState();
      showAlert(LL.common.success(), LL.settings.syncCleanupLocalArtifactsSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!settings) return;
    try {
      setSyncingNow(true);
      await restoreSnapshotBackup(settings);
      showAlert(LL.common.success(), LL.settings.syncBackupRestoreSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleDangerousClearSyncQueueAndConflicts = async () => {
    const confirmed = await showConfirm({
      title: LL.settings.syncDangerousClearQueueConfirmTitle(),
      message: LL.settings.syncDangerousClearQueueConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncDangerousClearQueueConfirmContinue(),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      setSyncingNow(true);
      await dangerouslyClearLocalSyncQueueAndConflicts();
      await refreshPendingSyncState();
      showAlert(LL.common.success(), LL.settings.syncDangerousClearQueueSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleRecoverFromEmail = async () => {
    const rawCode = extractRecoveryPayload(recoveryCode);
    if (!rawCode) {
      showAlert(LL.common.error(), LL.settings.syncRecoveryCodeRequired());
      return;
    }

    try {
      setSyncingNow(true);
      await recoverSyncDeviceFromRawInput(rawCode, settings ?? undefined);
      setRecoveryCode('');
      syncDebugLog('Recovery success');
      showAlert(LL.common.success(), LL.settings.syncRecoverySuccess());
    } catch (err) {
      syncDebugLog('Recovery failed', { error: err instanceof Error ? err.message : String(err) });
      const msg = getSyncErrorMessage(err, LL, LL.settings.syncGenericError());
      showAlert(LL.common.error(), msg);
    } finally {
      setSyncingNow(false);
    }
  };

  const handleOpenRecoveryScanner = async () => {
    if (isSyncRecoveryPayloadEntryEnabled) {
      setPayloadEntryOpen(true);
      return;
    }
    const granted = cameraPermission?.granted ? true : (await requestCameraPermission()).granted;
    if (!granted) {
      showAlert(LL.common.error(), LL.settings.syncRecoveryCameraPermissionDenied());
      return;
    }
    setScannerOpen(true);
  };

  const handleRecoveryScanned = (data: string) => {
    const payload = extractRecoveryPayload(data);
    if (!payload) return;
    setRecoveryCode(payload);
    setScannerOpen(false);
    showAlert(LL.common.success(), LL.settings.syncRecoveryCodeScanned());
  };

  const handleGenerateKeyBackup = () => {
    try {
      const key = syncInstanceKey.trim();
      if (!key) throw new Error(LL.settings.syncKeyBackupMissingKey());
      const payload = buildInstanceKeyBackupPayload(syncInstanceId, key);
      setKeyBackupPayload(payload);
      showAlert(LL.common.success(), LL.settings.syncKeyBackupGenerated());
    } catch (err) {
      showAlert(LL.common.error(), getSyncErrorMessage(err, LL, LL.settings.syncGenericError()));
    }
  };

  const handleRestoreKeyBackup = async () => {
    try {
      const parsed = parseInstanceKeyBackupPayload(keyRestorePayload);
      if (
        parsed.instanceId &&
        syncInstanceId.trim() &&
        parsed.instanceId !== syncInstanceId.trim()
      ) {
        throw new Error(LL.settings.syncKeyRestoreInstanceMismatch());
      }
      const update: { syncInstanceKey: string; syncInstanceId?: string } = {
        syncInstanceKey: parsed.key,
      };
      if (!syncInstanceId.trim() && parsed.instanceId) {
        update.syncInstanceId = parsed.instanceId;
      }
      await updateDeviceSyncSettings(update, settings ?? undefined);
      const deviceSettings = await getDeviceSyncSettings(settings ?? undefined);
      await upsertSyncRecoveryBootstrap({
        serverBaseUrl: deviceSettings.syncServerUrl,
        deviceId: deviceSettings.syncDeviceId,
        authToken: deviceSettings.syncAuthToken,
        allowPlaintext: deviceSettings.syncAllowPlaintext,
        instanceKey: deviceSettings.syncAllowPlaintext ? null : parsed.key,
      });
      setKeyRestorePayload('');
      showAlert(LL.common.success(), LL.settings.syncKeyRestoreSuccess());
    } catch (err) {
      showAlert(LL.common.error(), getSyncErrorMessage(err, LL, LL.settings.syncGenericError()));
    }
  };

  const handleEnableCryptoMode = async () => {
    if (!syncIsRegistered) {
      showAlert(LL.common.error(), LL.settings.syncStatusNotRegistered());
      return;
    }
    if (!supportsSecureCrypto) {
      showAlert(LL.common.error(), LL.settings.syncKeyBackupUnavailable());
      return;
    }
    const confirmed = await showConfirm({
      title: LL.settings.syncCryptoUpgradeConfirmTitle(),
      message: LL.settings.syncCryptoUpgradeConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncCryptoUpgradeConfirmContinue(),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const key = syncInstanceKey.trim() || generateInstanceKey();
      const deviceSettings = await getDeviceSyncSettings(settings ?? undefined);
      await upsertSyncRecoveryBootstrap({
        serverBaseUrl: deviceSettings.syncServerUrl,
        deviceId: deviceSettings.syncDeviceId,
        authToken: deviceSettings.syncAuthToken,
        allowPlaintext: false,
        instanceKey: key,
      });
      await updateDeviceSyncSettings(
        { syncAllowPlaintext: false, syncInstanceKey: key },
        settings ?? undefined,
      );
      setSyncAllowPlaintext(false);
      setSyncInstanceKey(key);
      showAlert(LL.common.success(), LL.settings.syncCryptoUpgradeSuccess());
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    }
  };

  const handleForgetRegistration = async () => {
    if (!settings) return;
    const confirmed = await showConfirm({
      title: LL.settings.syncForgetRegistrationConfirmTitle(),
      message: LL.settings.syncForgetRegistrationConfirmMessage(),
      cancelText: LL.common.cancel(),
      confirmText: LL.settings.syncForgetRegistration(),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setSyncingNow(true);
      await forgetServerRegistration(settings);
      await updateDeviceSyncSettings(
        {
          syncInstanceId: null,
          syncDeviceId: null,
          syncDeviceName: null,
          syncPairingToken: null,
          syncAuthToken: null,
          syncIsRegistered: false,
          syncInstanceKey: null,
          syncAllowPlaintext: false,
        },
        settings,
      );
      showAlert(LL.common.success(), LL.settings.syncForgetRegistrationSuccess());
      router.back();
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncGenericError(),
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const handleResolveConflict = async (
    conflict: SyncConflictModel,
    strategy: ConflictResolutionStrategy,
  ) => {
    const title =
      strategy === 'keep_local'
        ? LL.settings.syncResolveConflictKeepLocalConfirmTitle()
        : LL.settings.syncResolveConflictUseRemoteConfirmTitle();
    const message =
      strategy === 'keep_local'
        ? LL.settings.syncResolveConflictKeepLocalConfirmMessage()
        : LL.settings.syncResolveConflictUseRemoteConfirmMessage();
    const confirmText =
      strategy === 'keep_local'
        ? LL.settings.syncResolveConflictKeepLocal()
        : LL.settings.syncResolveConflictUseRemote();

    const confirmed = await showConfirm({
      title,
      message,
      cancelText: LL.common.cancel(),
      confirmText,
      destructive: strategy === 'use_remote',
    });
    if (!confirmed) {
      return;
    }

    try {
      setResolvingConflictId(conflict.id);
      await resolveConflictWithStrategy(conflict.id, strategy);
      showAlert(
        LL.common.success(),
        strategy === 'keep_local'
          ? LL.settings.syncResolveConflictKeepLocalSuccess()
          : LL.settings.syncResolveConflictUseRemoteSuccess(),
      );
    } catch (err) {
      const fallbackMessage =
        strategy === 'keep_local'
          ? LL.settings.syncResolveConflictKeepLocalFailed()
          : LL.settings.syncResolveConflictUseRemoteFailed();
      showAlert(LL.common.error(), err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setResolvingConflictId(null);
    }
  };

  const parseConflictRecord = (json?: string): Record<string, unknown> => {
    if (!json) return {};

    try {
      const parsed = JSON.parse(json) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };

  const getConflictFields = (conflict: SyncConflictModel): string[] => {
    if (!conflict.conflictingFieldsJson) {
      const localPayload = parseConflictRecord(conflict.localPayloadJson);
      const remotePayload = parseConflictRecord(conflict.remotePayloadJson);
      return Array.from(
        new Set([...Object.keys(localPayload), ...Object.keys(remotePayload)]),
      ).filter((fieldName) => localPayload[fieldName] !== remotePayload[fieldName]);
    }

    try {
      const parsed = JSON.parse(conflict.conflictingFieldsJson) as unknown;
      const parsedFields = Array.isArray(parsed)
        ? parsed.filter((field): field is string => typeof field === 'string')
        : [];
      if (parsedFields.length > 0) {
        return parsedFields;
      }

      const localPayload = parseConflictRecord(conflict.localPayloadJson);
      const remotePayload = parseConflictRecord(conflict.remotePayloadJson);
      return Array.from(
        new Set([...Object.keys(localPayload), ...Object.keys(remotePayload)]),
      ).filter((fieldName) => localPayload[fieldName] !== remotePayload[fieldName]);
    } catch {
      const localPayload = parseConflictRecord(conflict.localPayloadJson);
      const remotePayload = parseConflictRecord(conflict.remotePayloadJson);
      return Array.from(
        new Set([...Object.keys(localPayload), ...Object.keys(remotePayload)]),
      ).filter((fieldName) => localPayload[fieldName] !== remotePayload[fieldName]);
    }
  };

  const getConflictFieldsLabel = (conflict: SyncConflictModel): string | null => {
    const names = getConflictFields(conflict);
    return names.length > 0 ? names.join(', ') : null;
  };

  const humanizeFieldName = (fieldName: string): string =>
    fieldName.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  const getConflictTableLabel = (tableName: string): string => {
    switch (tableName) {
      case 'client':
        return LL.tabs.clients();
      case 'time_entry':
        return LL.timeTracking.title();
      case 'timesheet':
        return LL.timesheets.title();
      case 'invoice':
        return LL.invoices.title();
      case 'invoice_item':
        return `${LL.invoices.title()} / item`;
      case 'price_list_item':
        return LL.tabs.priceList();
      case 'client_address':
        return `${LL.tabs.clients()} / address`;
      case 'client_price_override':
        return `${LL.tabs.clients()} / pricing`;
      case 'currency_setting':
        return LL.settings.currenciesTitle();
      case 'app_settings':
        return LL.tabs.settings();
      case 'vat_code':
      case 'vat_rate':
        return LL.settings.vatTitle();
      default:
        return tableName;
    }
  };

  const getConflictFieldLabel = (tableName: string, fieldName: string): string => {
    const normalized = `${tableName}.${fieldName}`;
    switch (normalized) {
      case 'client.name':
        return LL.clients.clientName();
      case 'client.email':
        return LL.clients.email();
      case 'client.phone':
        return LL.clients.phone();
      case 'client.notes':
        return LL.clients.notes();
      case 'client.company_id':
        return LL.clients.companyId();
      case 'client.vat_number':
        return LL.clients.vatNumber();
      case 'price_list_item.name':
        return LL.priceList.name();
      case 'price_list_item.description':
        return LL.priceList.description();
      case 'price_list_item.default_price':
        return LL.priceList.defaultPrice();
      case 'time_entry.description':
        return LL.timeTracking.description();
      case 'invoice.invoice_number':
        return LL.invoices.invoiceNumber();
      case 'invoice.currency':
        return LL.settings.currenciesTitle();
      case 'invoice.payment_method':
        return LL.invoices.paymentMethod();
      default:
        return humanizeFieldName(fieldName);
    }
  };

  const formatConflictValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const openConflictDetail = (conflict: SyncConflictModel) => {
    setDetailSelections(
      Object.fromEntries(getConflictFields(conflict).map((field) => [field, 'local' as const])),
    );
    setDetailConflict(conflict);
  };

  const handleDetailSelectionChange = (fieldName: string, source: 'local' | 'remote') => {
    setDetailSelections((current) => ({
      ...current,
      [fieldName]: source,
    }));
  };

  const handleResolveConflictDetail = async () => {
    if (!detailConflict) return;

    const localPayload = parseConflictRecord(detailConflict.localPayloadJson);
    const remotePayload = parseConflictRecord(detailConflict.remotePayloadJson);
    const mergedPayload: Record<string, unknown> = { ...localPayload };

    for (const fieldName of getConflictFields(detailConflict)) {
      mergedPayload[fieldName] =
        detailSelections[fieldName] === 'remote'
          ? remotePayload[fieldName]
          : localPayload[fieldName];
    }

    try {
      setResolvingConflictId(detailConflict.id);
      await resolveConflictWithMergedPayload(detailConflict.id, mergedPayload, detailSelections);
      showAlert(LL.common.success(), LL.settings.syncResolveConflictMergeSuccess());
      setDetailConflict(null);
      setDetailSelections({});
    } catch (err) {
      showAlert(
        LL.common.error(),
        err instanceof Error ? err.message : LL.settings.syncResolveConflictMergeFailed(),
      );
    } finally {
      setResolvingConflictId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.syncMaintenancePageTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Sync & Backup */}
          {syncIsRegistered && (
            <>
              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncOptionsSection()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleSyncNow()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.actionLabel}>{LL.settings.syncOnlineNow()}</ThemedText>
                </Pressable>
                <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleTouchAllData()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.actionLabel}>
                    {LL.settings.syncTouchAllData()}
                  </ThemedText>
                  <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                    {LL.settings.syncTouchAllDataDescription()}
                  </ThemedText>
                </Pressable>
                <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleCleanupLocalArtifacts()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.actionLabel}>
                    {LL.settings.syncCleanupLocalArtifacts()}
                  </ThemedText>
                  <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                    {LL.settings.syncCleanupLocalArtifactsDescription()}
                  </ThemedText>
                </Pressable>
              </View>

              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncPendingOperationsTitle()}
              </ThemedText>
              <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
                {LL.settings.syncPendingOperationsDescription({
                  count: String(pendingOperations.length),
                })}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                {pendingOperations.length === 0 ? (
                  <View style={styles.actionRow}>
                    <ThemedText style={styles.actionLabel}>0</ThemedText>
                  </View>
                ) : (
                  pendingOperations.map((operation, index) => (
                    <View key={operation.id}>
                      <View style={styles.actionRow}>
                        <ThemedText style={styles.actionLabel}>
                          {operation.operationType.toUpperCase()} • {operation.tableName}
                        </ThemedText>
                        <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                          {operation.recordId} • retry {operation.retryCount}
                        </ThemedText>
                      </View>
                      {index < pendingOperations.length - 1 ? (
                        <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                      ) : null}
                    </View>
                  ))
                )}
              </View>

              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncPendingConflictsTitle()}
              </ThemedText>
              <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
                {LL.settings.syncPendingConflictsDescription({
                  count: String(pendingConflicts.length),
                })}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                {pendingConflicts.length === 0 ? (
                  <View style={styles.actionRow}>
                    <ThemedText style={styles.actionLabel}>0</ThemedText>
                  </View>
                ) : (
                  pendingConflicts.map((conflict, index) => (
                    <View key={conflict.id}>
                      <View style={styles.actionRow}>
                        <ThemedText style={styles.actionLabel}>
                          {conflict.conflictType} • {conflict.tableName}
                        </ThemedText>
                        <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                          {conflict.recordId}
                        </ThemedText>
                        {getConflictFieldsLabel(conflict) ? (
                          <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                            {LL.settings.syncResolveConflictFieldsLabel({
                              fields: getConflictFieldsLabel(conflict) || '',
                            })}
                          </ThemedText>
                        ) : null}
                        <View style={styles.conflictActionsRow}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.conflictActionButton,
                              {
                                backgroundColor: palette.buttonNeutralBackground,
                                borderColor: palette.inputBorder,
                              },
                              (pressed || resolvingConflictId === conflict.id) &&
                                styles.buttonDisabled,
                            ]}
                            onPress={() => openConflictDetail(conflict)}
                            disabled={resolvingConflictId === conflict.id}
                          >
                            <ThemedText
                              style={[styles.conflictActionButtonText, { color: palette.text }]}
                            >
                              {LL.settings.syncResolveConflictDetail()}
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.conflictActionButton,
                              { borderColor: palette.tint },
                              (pressed || resolvingConflictId === conflict.id) &&
                                styles.buttonDisabled,
                            ]}
                            onPress={() => void handleResolveConflict(conflict, 'keep_local')}
                            disabled={resolvingConflictId === conflict.id}
                          >
                            <ThemedText
                              style={[styles.conflictActionButtonText, { color: palette.tint }]}
                            >
                              {LL.settings.syncResolveConflictKeepLocal()}
                            </ThemedText>
                          </Pressable>
                          <Pressable
                            style={({ pressed }) => [
                              styles.conflictActionButton,
                              {
                                backgroundColor: palette.destructive,
                                borderColor: palette.destructive,
                              },
                              (pressed || resolvingConflictId === conflict.id) &&
                                styles.buttonDisabled,
                            ]}
                            onPress={() => void handleResolveConflict(conflict, 'use_remote')}
                            disabled={resolvingConflictId === conflict.id}
                          >
                            <ThemedText
                              style={[
                                styles.conflictActionButtonText,
                                { color: palette.onDestructive },
                              ]}
                            >
                              {LL.settings.syncResolveConflictUseRemote()}
                            </ThemedText>
                          </Pressable>
                        </View>
                      </View>
                      {index < pendingConflicts.length - 1 ? (
                        <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                      ) : null}
                    </View>
                  ))
                )}
              </View>

              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncBackupTitle()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleCreateBackup()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.actionLabel}>
                    {LL.settings.syncBackupCreate()}
                  </ThemedText>
                </Pressable>
                <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleRestoreBackup()}
                  disabled={syncingNow}
                >
                  <ThemedText style={styles.actionLabel}>
                    {LL.settings.syncBackupRestore()}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          )}

          {/* Recovery */}
          <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            {LL.settings.syncRecoveryTitle()}
          </ThemedText>
          <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
            {LL.settings.syncRecoveryDescription()}
          </ThemedText>
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            <View style={styles.inputsWrapper}>
              <TextInput
                style={[styles.input, { color: palette.text, borderColor: palette.inputBorder }]}
                placeholder={LL.settings.syncRecoveryCode()}
                placeholderTextColor={palette.placeholder}
                value={recoveryCode}
                onChangeText={setRecoveryCode}
                multiline
                autoCapitalize="none"
              />
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: palette.tint },
              (pressed || syncingNow) && styles.buttonDisabled,
            ]}
            onPress={() => void handleOpenRecoveryScanner()}
            disabled={syncingNow}
          >
            <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
              {LL.settings.syncRecoveryScanCamera()}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.tint },
              (pressed || syncingNow) && styles.buttonDisabled,
            ]}
            onPress={() => void handleRecoverFromEmail()}
            disabled={syncingNow}
          >
            <ThemedText style={styles.primaryButtonText}>
              {LL.settings.syncRecoveryRun()}
            </ThemedText>
          </Pressable>

          {/* Key backup */}
          <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
            {LL.settings.syncKeyBackupTitle()}
          </ThemedText>
          {supportsSecureCrypto ? (
            <>
              <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
                {LL.settings.syncKeyBackupDescription()}
              </ThemedText>
              {syncIsRegistered && syncAllowPlaintext && (
                <>
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: palette.tint },
                      (pressed || syncingNow) && styles.buttonDisabled,
                    ]}
                    onPress={() => void handleEnableCryptoMode()}
                    disabled={syncingNow}
                  >
                    <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
                      {LL.settings.syncCryptoUpgradeAction()}
                    </ThemedText>
                  </Pressable>
                  <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
                    {LL.settings.syncCryptoUpgradeDescription()}
                  </ThemedText>
                </>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: palette.tint },
                  pressed && styles.buttonDisabled,
                ]}
                onPress={handleGenerateKeyBackup}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
                  {LL.settings.syncKeyBackupGenerate()}
                </ThemedText>
              </Pressable>
              {!!keyBackupPayload && (
                <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                  <View style={styles.inputsWrapper}>
                    <TextInput
                      style={[
                        styles.input,
                        { color: palette.text, borderColor: palette.inputBorder },
                      ]}
                      placeholder={LL.settings.syncKeyBackupPayload()}
                      placeholderTextColor={palette.placeholder}
                      value={keyBackupPayload}
                      editable={false}
                      multiline
                    />
                  </View>
                </View>
              )}
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                <View style={styles.inputsWrapper}>
                  <TextInput
                    style={[
                      styles.input,
                      { color: palette.text, borderColor: palette.inputBorder },
                    ]}
                    placeholder={LL.settings.syncKeyRestorePayload()}
                    placeholderTextColor={palette.placeholder}
                    value={keyRestorePayload}
                    onChangeText={setKeyRestorePayload}
                    multiline
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: palette.tint },
                  pressed && styles.buttonDisabled,
                ]}
                onPress={() => void handleRestoreKeyBackup()}
              >
                <ThemedText style={styles.primaryButtonText}>
                  {LL.settings.syncKeyRestoreRun()}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ThemedText style={[styles.sectionDesc, { color: palette.textSecondary }]}>
              {LL.settings.syncKeyBackupUnavailable()}
            </ThemedText>
          )}

          {/* Danger zone */}
          {syncIsRegistered && (
            <>
              <ThemedText style={[styles.sectionHeader, { color: palette.textSecondary }]}>
                {LL.settings.syncDangerZone()}
              </ThemedText>
              <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
                {isDangerousSyncResetEnabled ? (
                  <>
                    <Pressable
                      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                      onPress={() => void handleDangerousClearSyncQueueAndConflicts()}
                      disabled={syncingNow}
                    >
                      <ThemedText style={[styles.actionLabel, { color: palette.destructive }]}>
                        {LL.settings.syncDangerousClearQueue()}
                      </ThemedText>
                      <ThemedText style={[styles.actionDesc, { color: palette.textSecondary }]}>
                        {LL.settings.syncDangerousClearQueueDescription()}
                      </ThemedText>
                    </Pressable>
                    <View style={[styles.rowDivider, { backgroundColor: palette.border }]} />
                  </>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
                  onPress={() => void handleForgetRegistration()}
                  disabled={syncingNow}
                >
                  <ThemedText style={[styles.actionLabel, { color: palette.destructive }]}>
                    {LL.settings.syncForgetRegistration()}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <QrScannerModal
        visible={scannerOpen}
        hint={LL.settings.syncRecoveryScanHint()}
        cancelLabel={LL.common.cancel()}
        onScanned={handleRecoveryScanned}
        onClose={() => setScannerOpen(false)}
      />
      <SyncPayloadEntryModal
        visible={payloadEntryOpen}
        title={LL.settings.syncRecoveryTitle()}
        placeholder={LL.settings.syncRecoveryCode()}
        value={recoveryCode}
        onChangeText={setRecoveryCode}
        onClose={() => setPayloadEntryOpen(false)}
        onSave={() => setPayloadEntryOpen(false)}
      />
      <BottomSheetFormModal
        visible={detailConflict !== null}
        onClose={() => {
          setDetailConflict(null);
          setDetailSelections({});
        }}
        onSave={() => void handleResolveConflictDetail()}
        title={LL.settings.syncResolveConflictDetailTitle()}
      >
        {detailConflict ? (
          <View style={styles.conflictDetailContent}>
            <ThemedText style={[styles.conflictDetailIntro, { color: palette.textSecondary }]}>
              {LL.settings.syncResolveConflictDetailDescription()}
            </ThemedText>
            <View
              style={[
                styles.conflictFieldCard,
                styles.conflictDetailSummaryCard,
                { backgroundColor: palette.cardBackground },
              ]}
            >
              <ThemedText type="defaultSemiBold" style={styles.conflictFieldTitle}>
                {getConflictTableLabel(detailConflict.tableName)}
              </ThemedText>
              <ThemedText style={[styles.conflictFieldPath, { color: palette.textSecondary }]}>
                {`${detailConflict.tableName} • ${detailConflict.recordId}`}
              </ThemedText>
            </View>
            {getConflictFields(detailConflict).map((fieldName) => {
              const localPayload = parseConflictRecord(detailConflict.localPayloadJson);
              const remotePayload = parseConflictRecord(detailConflict.remotePayloadJson);
              const selectedSource = detailSelections[fieldName] ?? 'local';

              return (
                <View
                  key={fieldName}
                  style={[styles.conflictFieldCard, { backgroundColor: palette.cardBackground }]}
                >
                  <ThemedText type="defaultSemiBold" style={styles.conflictFieldTitle}>
                    {getConflictFieldLabel(detailConflict.tableName, fieldName)}
                  </ThemedText>
                  <ThemedText style={[styles.conflictFieldPath, { color: palette.textSecondary }]}>
                    {`${detailConflict.tableName}.${fieldName}`}
                  </ThemedText>
                  <View style={styles.conflictValueGrid}>
                    <View style={styles.conflictValueColumn}>
                      <ThemedText
                        style={[styles.conflictValueHeading, { color: palette.textSecondary }]}
                      >
                        {LL.settings.syncResolveConflictLocalColumn()}
                      </ThemedText>
                      <ThemedText style={styles.conflictValueText}>
                        {formatConflictValue(localPayload[fieldName])}
                      </ThemedText>
                    </View>
                    <View style={styles.conflictValueColumn}>
                      <ThemedText
                        style={[styles.conflictValueHeading, { color: palette.textSecondary }]}
                      >
                        {LL.settings.syncResolveConflictRemoteColumn()}
                      </ThemedText>
                      <ThemedText style={styles.conflictValueText}>
                        {formatConflictValue(remotePayload[fieldName])}
                      </ThemedText>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.conflictChoiceSegmentedControl,
                      {
                        borderColor: palette.border,
                        backgroundColor: palette.buttonNeutralBackground,
                      },
                    ]}
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.conflictChoiceSegment,
                        {
                          backgroundColor:
                            selectedSource === 'local' ? palette.tint : 'transparent',
                        },
                        pressed && styles.buttonDisabled,
                      ]}
                      onPress={() => handleDetailSelectionChange(fieldName, 'local')}
                    >
                      <ThemedText
                        style={[
                          styles.conflictChoiceButtonText,
                          { color: selectedSource === 'local' ? palette.onTint : palette.text },
                        ]}
                      >
                        {LL.settings.syncResolveConflictKeepLocal()}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.conflictChoiceSegment,
                        {
                          backgroundColor:
                            selectedSource === 'remote' ? palette.tint : 'transparent',
                        },
                        pressed && styles.buttonDisabled,
                      ]}
                      onPress={() => handleDetailSelectionChange(fieldName, 'remote')}
                    >
                      <ThemedText
                        style={[
                          styles.conflictChoiceButtonText,
                          { color: selectedSource === 'remote' ? palette.onTint : palette.text },
                        ]}
                      >
                        {LL.settings.syncResolveConflictUseRemote()}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </BottomSheetFormModal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 40, gap: Spacing.xs },

  sectionHeader: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: 2,
  },

  card: { borderRadius: 12, overflow: 'hidden' },

  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 14 },

  actionRow: {
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  actionLabel: { fontSize: FontSizes.md },
  actionDesc: { fontSize: FontSizes.xs, marginTop: 2 },

  sectionDesc: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
    paddingHorizontal: 2,
  },

  inputsWrapper: { padding: Spacing.sm, gap: Spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  primaryButton: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { fontSize: FontSizes.md, fontWeight: '600', color: '#fff' },
  secondaryButton: {
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: FontSizes.md, fontWeight: '600' },
  buttonDisabled: { opacity: 0.55 },
  conflictActionsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  conflictActionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  conflictActionButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  conflictDetailContent: {
    gap: Spacing.sm,
  },
  conflictDetailIntro: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  conflictFieldCard: {
    borderRadius: 12,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  conflictDetailSummaryCard: {
    marginBottom: Spacing.xs,
  },
  conflictFieldTitle: {
    fontSize: FontSizes.md,
  },
  conflictFieldPath: {
    fontSize: FontSizes.xs,
  },
  conflictValueGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  conflictValueColumn: {
    flex: 1,
    gap: 4,
  },
  conflictValueHeading: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  conflictValueText: {
    fontSize: FontSizes.sm,
  },
  conflictChoiceSegmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 3,
    gap: 2,
    marginTop: Spacing.xs,
  },
  conflictChoiceSegment: {
    flex: 1,
    minHeight: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  conflictChoiceButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },

  pressed: { opacity: 0.72 },
});
