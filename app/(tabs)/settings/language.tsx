import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getLanguageSettingOptions,
  normalizeLanguageSetting,
  resolveAppLanguageSetting,
  type AppLanguageSetting,
} from '@/i18n/locale-options';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet } from 'react-native';

export default function SettingsLanguageScreen() {
  const colorScheme = useColorScheme();
  const headerHeight = useHeaderHeight();
  const { LL, setLocale } = useI18nContext();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [language, setLanguage] = useState<AppLanguageSetting>('system');

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      const settingsLanguage = normalizeLanguageSetting(settings.language, 'system');
      const settingsLocale = resolveAppLanguageSetting(settingsLanguage, 'en');
      setLanguage(settingsLanguage);
      setLocale(settingsLocale);
    };

    void loadSettings();
  }, [setLocale]);

  const handleSave = async () => {
    try {
      await updateSettings({ language });
      setLocale(resolveAppLanguageSetting(language, 'en'));
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving language settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.languageTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={[styles.section, sectionCard(colorScheme)]}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              {LL.settings.language()}
            </ThemedText>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.languageSubtitle()}
            </ThemedText>
            <Select
              value={language}
              onValueChange={(value) => setLanguage(normalizeLanguageSetting(value, 'system'))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{LL.settings.language()}</SelectLabel>
                  {getLanguageSettingOptions(resolveAppLanguageSetting(language, 'en')).map(
                    (localeOption) => (
                      <SelectItem
                        key={localeOption.value}
                        value={localeOption.value}
                        label={localeOption.label}
                      >
                        {localeOption.label}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText
              style={[styles.saveButtonText, { color: Colors[colorScheme ?? 'light'].onTint }]}
            >
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function sectionCard(colorScheme: ReturnType<typeof useColorScheme>) {
  return {
    backgroundColor: Colors[colorScheme ?? 'light'].cardBackground,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.82 },
});
