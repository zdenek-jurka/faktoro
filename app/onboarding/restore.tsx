import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import {
  inspectOfflineBackupContent,
  restoreOfflineBackupContent,
} from '@/repositories/offline-backup-repository';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { requestAppDataReload } from '@/utils/app-data-reload';
import { showConfirm } from '@/utils/platform-alert';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SelectedFile = {
  name: string;
  content: string;
  createdAt: number;
  encrypted: boolean;
};

function formatError(err: unknown, fallbackMessage: string): string {
  if (err instanceof Error && err.message?.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallbackMessage;
}

export default function OnboardingRestoreScreen() {
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [isPickLoading, setIsPickLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);

  const formattedDate = useMemo(() => {
    if (!selectedFile) return '';
    return new Date(selectedFile.createdAt).toLocaleString(intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [intlLocale, selectedFile]);

  async function handlePickFile() {
    setIsPickLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ExpoFileSystem = require('expo-file-system');
      const picked = await ExpoFileSystem.File.pickFileAsync(undefined, 'application/json');
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) return;
      const content = await file.text();
      const inspection = inspectOfflineBackupContent(content);
      setSelectedFile({
        name: file.name || '—',
        content,
        createdAt: inspection.createdAt,
        encrypted: inspection.encrypted,
      });
      setRestorePassword('');
    } catch (err) {
      const msg = formatError(err, LL.common.errorUnknown());
      if (msg.toLowerCase().includes('cancel')) return;
      Alert.alert(LL.common.error(), `${LL.onboarding.restoreInvalidFile()}\n\n${msg}`);
    } finally {
      setIsPickLoading(false);
    }
  }

  async function handleRestore() {
    if (!selectedFile) return;

    if (selectedFile.encrypted && !restorePassword.trim()) {
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
      await restoreOfflineBackupContent(selectedFile.content, {
        password: selectedFile.encrypted ? restorePassword : null,
      });
      await setOnboardingCompleted();
      Alert.alert(LL.common.success(), LL.onboarding.restoreSuccess(), [
        {
          text: LL.common.ok(),
          onPress: () => {
            requestAppDataReload();
            router.replace('/(tabs)/time-tracking');
          },
        },
      ]);
    } catch (err) {
      Alert.alert(
        LL.common.error(),
        `${LL.onboarding.restoreError()}\n\n${formatError(err, LL.common.errorUnknown())}`,
      );
    } finally {
      setIsRestoreLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <KeyboardAwareScroll
        style={styles.flex}
        scrollViewStyle={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={20} color={palette.tint} />
            <ThemedText style={[styles.backLabel, { color: palette.tint }]}>
              {LL.onboarding.back()}
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            {LL.onboarding.restoreTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.restoreSubtitle()}
          </ThemedText>
        </View>

        {/* File picker */}
        <Pressable
          style={[
            styles.pickButton,
            { backgroundColor: palette.cardBackground, borderColor: palette.border },
          ]}
          onPress={handlePickFile}
          disabled={isPickLoading}
          android_ripple={{ color: palette.border }}
        >
          {isPickLoading ? (
            <ActivityIndicator size="small" color={palette.tint} />
          ) : (
            <>
              <IconSymbol name="folder" size={22} color={palette.tint} />
              <ThemedText style={[styles.pickButtonText, { color: palette.tint }]}>
                {LL.onboarding.restorePickFile()}
              </ThemedText>
            </>
          )}
        </Pressable>

        {/* File info */}
        {selectedFile && (
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            <View style={styles.fileRow}>
              <IconSymbol name="doc.fill" size={20} color={palette.icon} />
              <ThemedText type="defaultSemiBold" style={styles.fileName} numberOfLines={1}>
                {selectedFile.name}
              </ThemedText>
            </View>

            <View style={styles.metaRow}>
              <ThemedText style={[styles.metaLabel, { color: palette.textSecondary }]}>
                {LL.onboarding.restoreCreatedAt()}
              </ThemedText>
              <ThemedText style={styles.metaValue}>{formattedDate}</ThemedText>
            </View>

            <View style={styles.metaRow}>
              <ThemedText style={[styles.metaLabel, { color: palette.textSecondary }]}>
                {LL.onboarding.restoreEncryptedLabel()}
              </ThemedText>
              <ThemedText style={styles.metaValue}>
                {selectedFile.encrypted
                  ? LL.onboarding.restoreEncryptedLabel()
                  : LL.onboarding.restoreNotEncryptedLabel()}
              </ThemedText>
            </View>

            {selectedFile.encrypted && (
              <View style={styles.field}>
                <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  {LL.onboarding.restorePasswordLabel()} *
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: palette.inputBackground,
                      borderColor: palette.inputBorder,
                      color: palette.text,
                    },
                  ]}
                  value={restorePassword}
                  onChangeText={setRestorePassword}
                  placeholder={LL.onboarding.restorePasswordLabel()}
                  placeholderTextColor={palette.placeholder}
                  secureTextEntry
                />
              </View>
            )}

            <Pressable
              style={[styles.restoreButton, { backgroundColor: palette.tint }]}
              onPress={handleRestore}
              disabled={isRestoreLoading}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              {isRestoreLoading ? (
                <ActivityIndicator size="small" color={palette.onTint} />
              ) : (
                <ThemedText style={[styles.restoreButtonText, { color: palette.onTint }]}>
                  {LL.onboarding.restoreButton()}
                </ThemedText>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40, gap: 16 },
  header: { gap: 8 },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  backLabel: { fontSize: 16 },
  title: { fontSize: 28 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  pickButtonText: { fontSize: 16, fontWeight: '600' },
  card: { borderRadius: 14, padding: 16, gap: 12 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileName: { flex: 1, fontSize: 15 },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaLabel: { fontSize: 13, flex: 1 },
  metaValue: { fontSize: 13, fontWeight: '500' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  restoreButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  restoreButtonText: { fontSize: 16, fontWeight: '600' },
});
