import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import {
  createOfflineBackupFile,
  inspectOfflineBackupContent,
  restoreOfflineBackupContent,
} from '@/repositories/offline-backup-repository';
import { requestAppDataReload } from '@/utils/app-data-reload';
import { getOfflineBackupErrorMessage, getRawErrorMessage } from '@/utils/error-utils';
import { buildCopyFileName } from '@/utils/file-name-utils';
import { showConfirm } from '@/utils/platform-alert';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

type SelectedBackupFile = {
  name: string;
  content: string;
  createdAt: number;
  encrypted: boolean;
  compressed: boolean;
};

export default function SettingsOfflineBackupScreen() {
  const colorScheme = useColorScheme();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const palette = Colors[(colorScheme ?? 'light') as 'light' | 'dark'];

  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<SelectedBackupFile | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const isCreateSectionBusy = isCreateLoading || isSaveLoading;

  const formattedRestoreDate = useMemo(() => {
    if (!selectedRestoreFile) return '';
    return new Date(selectedRestoreFile.createdAt).toLocaleString(intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [intlLocale, selectedRestoreFile]);

  const handleTogglePassword = (value: boolean) => {
    setIsPasswordEnabled(value);
    if (!value) {
      setBackupPassword('');
      setBackupPasswordConfirm('');
    }
  };

  const validateCreateBackupPassword = (): string | null | undefined => {
    const normalizedPassword = backupPassword.trim();
    const normalizedConfirm = backupPasswordConfirm.trim();

    if (isPasswordEnabled && !normalizedPassword) {
      Alert.alert(LL.common.error(), LL.settings.offlineBackupPasswordRequired());
      return undefined;
    }

    if (isPasswordEnabled && normalizedPassword !== normalizedConfirm) {
      Alert.alert(LL.common.error(), LL.settings.offlineBackupPasswordMismatch());
      return undefined;
    }

    return isPasswordEnabled ? normalizedPassword : null;
  };

  const handleCreateBackup = async () => {
    const password = validateCreateBackupPassword();
    if (password === undefined) {
      return;
    }

    setIsCreateLoading(true);
    try {
      const backup = await createOfflineBackupFile({ password });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      const canShare = await Sharing.isAvailableAsync();

      if (canShare) {
        await Sharing.shareAsync(backup.uri, {
          mimeType: 'application/json',
          dialogTitle: LL.settings.offlineBackupCreateAction(),
          UTI: 'public.json',
        });
      }

      Alert.alert(LL.common.success(), LL.settings.offlineBackupCreateSuccess());
    } catch (error) {
      console.error('Error creating offline backup:', error);
      Alert.alert(
        LL.common.error(),
        `${LL.settings.offlineBackupCreateError()}\n\n${getOfflineBackupErrorMessage(
          error,
          LL,
          LL.settings.offlineBackupCreateError(),
        )}`,
      );
    } finally {
      setIsCreateLoading(false);
    }
  };

  const handleSaveBackup = async () => {
    const password = validateCreateBackupPassword();
    if (password === undefined) {
      return;
    }

    setIsSaveLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const backupFile = await createOfflineBackupFile({ password });
      const pickedDirectory = await FileSystem.Directory.pickDirectoryAsync();
      if (isIos) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      const sourceFile = new FileSystem.File(backupFile.uri);
      const existingEntries = pickedDirectory.list();
      const existingEntry = existingEntries.find(
        (entry: InstanceType<typeof FileSystem.File> | InstanceType<typeof FileSystem.Directory>) =>
          entry.name === backupFile.fileName,
      );

      let targetFileName = backupFile.fileName;
      if (existingEntry) {
        if (existingEntry instanceof FileSystem.Directory) {
          throw new Error(LL.settings.offlineBackupSaveNameConflictFolder());
        }

        const existingNames = new Set(existingEntries.map((entry) => entry.name));
        const copyFileName = buildCopyFileName(backupFile.fileName, existingNames);
        targetFileName = await new Promise<string | null>((resolve) => {
          Alert.alert(
            LL.settings.offlineBackupSaveExistsTitle(),
            LL.settings.offlineBackupSaveExistsMessage({ fileName: backupFile.fileName }),
            [
              {
                text: LL.common.cancel(),
                style: 'cancel',
                onPress: () => resolve(null),
              },
              {
                text: LL.settings.offlineBackupSaveCopy(),
                onPress: () => resolve(copyFileName),
              },
              {
                text: LL.settings.offlineBackupSaveReplace(),
                style: 'destructive',
                onPress: () => resolve(backupFile.fileName),
              },
            ],
            {
              cancelable: true,
              onDismiss: () => resolve(null),
            },
          );
        });

        if (!targetFileName) {
          return;
        }

        if (targetFileName === backupFile.fileName) {
          existingEntry.delete();
        }
      }

      const targetFile = pickedDirectory.createFile(targetFileName, 'application/json');
      targetFile.write(await sourceFile.bytes());

      Alert.alert(
        LL.common.success(),
        LL.settings.offlineBackupSaveSuccess({ fileName: targetFileName }),
      );
    } catch (error) {
      const rawMessage = getRawErrorMessage(error);
      if (rawMessage && /cancel(?:ed|led)/i.test(rawMessage)) {
        return;
      }

      console.error('Error saving offline backup:', error);
      Alert.alert(
        LL.common.error(),
        `${LL.settings.offlineBackupSaveError()}\n\n${getOfflineBackupErrorMessage(
          error,
          LL,
          LL.settings.offlineBackupSaveError(),
        )}`,
      );
    } finally {
      setIsSaveLoading(false);
    }
  };

  const handlePickRestoreFile = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ExpoFileSystem = require('expo-file-system');
      const picked = await ExpoFileSystem.File.pickFileAsync(undefined, 'application/json');
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) return;

      const content = await file.text();
      const inspection = inspectOfflineBackupContent(content);
      setSelectedRestoreFile({
        name: file.name || LL.settings.offlineBackupUnknownFile(),
        content,
        createdAt: inspection.createdAt,
        encrypted: inspection.encrypted,
        compressed: inspection.compressed,
      });
      setRestorePassword('');
    } catch (error) {
      const message = getOfflineBackupErrorMessage(
        error,
        LL,
        LL.settings.offlineBackupInvalidFile(),
      );
      if (message.toLowerCase().includes('cancel')) {
        return;
      }

      console.error('Error picking restore backup file:', error);
      Alert.alert(LL.common.error(), `${LL.settings.offlineBackupInvalidFile()}\n\n${message}`);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedRestoreFile) {
      Alert.alert(LL.common.error(), LL.settings.offlineBackupNoFileSelected());
      return;
    }

    if (selectedRestoreFile.encrypted && !restorePassword.trim()) {
      Alert.alert(LL.common.error(), LL.settings.offlineBackupRestorePasswordRequired());
      return;
    }

    const confirmed = await showConfirm({
      title: LL.settings.offlineBackupRestoreConfirmTitle(),
      message: LL.settings.offlineBackupRestoreConfirmMessage(),
      confirmText: LL.settings.offlineBackupRestoreAction(),
      cancelText: LL.common.cancel(),
      destructive: true,
    });

    if (!confirmed) return;

    setIsRestoreLoading(true);
    try {
      await restoreOfflineBackupContent(selectedRestoreFile.content, {
        password: selectedRestoreFile.encrypted ? restorePassword : null,
      });
      Alert.alert(LL.common.success(), LL.settings.offlineBackupRestoreSuccess(), [
        {
          text: LL.common.ok(),
          onPress: () => {
            requestAppDataReload();
            router.replace('/settings');
          },
        },
      ]);
    } catch (error) {
      console.error('Error restoring offline backup:', error);
      Alert.alert(
        LL.common.error(),
        `${LL.settings.offlineBackupRestoreError()}\n\n${getOfflineBackupErrorMessage(
          error,
          LL,
          LL.settings.offlineBackupRestoreError(),
        )}`,
      );
    } finally {
      setIsRestoreLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.offlineBackupTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : 'height'}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.settings.offlineBackupCreateTitle()}
            </ThemedText>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.offlineBackupCreateDescription()}
            </ThemedText>
            <ThemedText style={styles.noteText}>
              {LL.settings.offlineBackupIncludesHint()}
            </ThemedText>
            <ThemedText style={styles.noteText}>
              {LL.settings.offlineBackupExcludesHint()}
            </ThemedText>

            <View style={styles.switchRow}>
              <View style={styles.switchLabelContainer}>
                <ThemedText type="defaultSemiBold">
                  {LL.settings.offlineBackupPasswordProtectTitle()}
                </ThemedText>
                <ThemedText style={styles.inlineDescription}>
                  {LL.settings.offlineBackupPasswordProtectDescription()}
                </ThemedText>
              </View>
              <Switch
                value={isPasswordEnabled}
                onValueChange={handleTogglePassword}
                {...getSwitchColors(palette)}
              />
            </View>

            {isPasswordEnabled && (
              <View style={styles.formStack}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      borderColor: palette.inputBorder,
                      backgroundColor: palette.inputBackground,
                    },
                  ]}
                  value={backupPassword}
                  onChangeText={setBackupPassword}
                  placeholder={LL.settings.offlineBackupPasswordLabel()}
                  placeholderTextColor={palette.placeholder}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      borderColor: palette.inputBorder,
                      backgroundColor: palette.inputBackground,
                    },
                  ]}
                  value={backupPasswordConfirm}
                  onChangeText={setBackupPasswordConfirm}
                  placeholder={LL.settings.offlineBackupPasswordConfirmLabel()}
                  placeholderTextColor={palette.placeholder}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.tint,
                  opacity: pressed || isCreateSectionBusy ? 0.78 : 1,
                },
              ]}
              onPress={() => void handleCreateBackup()}
              disabled={isCreateSectionBusy}
            >
              {isCreateLoading ? (
                <ActivityIndicator color={palette.onTint} />
              ) : (
                <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
                  {LL.settings.offlineBackupCreateAction()}
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.inputBackground,
                  opacity: pressed || isCreateSectionBusy ? 0.78 : 1,
                },
              ]}
              onPress={() => void handleSaveBackup()}
              disabled={isCreateSectionBusy}
            >
              {isSaveLoading ? (
                <ActivityIndicator color={palette.tint} />
              ) : (
                <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
                  {LL.settings.offlineBackupSaveAction()}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>

          <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.settings.offlineBackupRestoreTitle()}
            </ThemedText>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.offlineBackupRestoreDescription()}
            </ThemedText>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.inputBackground,
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
              onPress={() => void handlePickRestoreFile()}
            >
              <ThemedText style={[styles.secondaryButtonText, { color: palette.tint }]}>
                {LL.settings.offlineBackupPickFileAction()}
              </ThemedText>
            </Pressable>

            {selectedRestoreFile && (
              <View
                style={[
                  styles.fileSummaryCard,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.inputBackground,
                  },
                ]}
              >
                <View style={styles.fileSummaryRow}>
                  <ThemedText type="defaultSemiBold">
                    {LL.settings.offlineBackupSelectedFileLabel()}
                  </ThemedText>
                  <ThemedText style={styles.fileSummaryValue}>
                    {selectedRestoreFile.name}
                  </ThemedText>
                </View>
                <View style={styles.fileSummaryRow}>
                  <ThemedText type="defaultSemiBold">
                    {LL.settings.offlineBackupCreatedAtLabel()}
                  </ThemedText>
                  <ThemedText style={styles.fileSummaryValue}>{formattedRestoreDate}</ThemedText>
                </View>
                <View style={styles.fileSummaryRow}>
                  <ThemedText type="defaultSemiBold">
                    {LL.settings.offlineBackupEncryptionLabel()}
                  </ThemedText>
                  <ThemedText style={styles.fileSummaryValue}>
                    {selectedRestoreFile.encrypted
                      ? LL.settings.offlineBackupEncryptionProtected()
                      : LL.settings.offlineBackupEncryptionUnprotected()}
                  </ThemedText>
                </View>
                <View style={styles.fileSummaryRow}>
                  <ThemedText type="defaultSemiBold">
                    {LL.settings.offlineBackupCompressionLabel()}
                  </ThemedText>
                  <ThemedText style={styles.fileSummaryValue}>
                    {selectedRestoreFile.compressed
                      ? LL.settings.offlineBackupCompressionYes()
                      : LL.settings.offlineBackupCompressionNo()}
                  </ThemedText>
                </View>
              </View>
            )}

            {selectedRestoreFile?.encrypted && (
              <TextInput
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.inputBorder,
                    backgroundColor: palette.inputBackground,
                  },
                ]}
                value={restorePassword}
                onChangeText={setRestorePassword}
                placeholder={LL.settings.offlineBackupRestorePasswordLabel()}
                placeholderTextColor={palette.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            <Pressable
              style={({ pressed }) => [
                styles.destructiveButton,
                {
                  backgroundColor: palette.destructive,
                  opacity:
                    pressed || isRestoreLoading || !selectedRestoreFile
                      ? 0.78
                      : selectedRestoreFile
                        ? 1
                        : 0.55,
                },
              ]}
              onPress={() => void handleRestoreBackup()}
              disabled={isRestoreLoading || !selectedRestoreFile}
            >
              {isRestoreLoading ? (
                <ActivityIndicator color={palette.onDestructive} />
              ) : (
                <ThemedText style={[styles.primaryButtonText, { color: palette.onDestructive }]}>
                  {LL.settings.offlineBackupRestoreAction()}
                </ThemedText>
              )}
            </Pressable>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40, gap: 16 },
  section: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { marginBottom: 2 },
  sectionDescription: { fontSize: 14, opacity: 0.72 },
  noteText: { fontSize: 13, opacity: 0.72 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  switchLabelContainer: { flex: 1, gap: 4 },
  inlineDescription: { fontSize: 13, opacity: 0.7 },
  formStack: { gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  destructiveButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  fileSummaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  fileSummaryRow: {
    gap: 4,
  },
  fileSummaryValue: {
    fontSize: 14,
    opacity: 0.78,
  },
});
