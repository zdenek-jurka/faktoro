import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getLanguageSettingOptions,
  normalizeLanguageSetting,
  resolveAppLanguageSetting,
  type AppLanguageSetting,
} from '@/i18n/locale-options';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingLanguageScreen() {
  const palette = usePalette();
  const { LL, setLocale } = useI18nContext();
  const router = useRouter();
  const [language, setLanguage] = useState<AppLanguageSetting>('system');

  useEffect(() => {
    getSettings().then((settings) => {
      const lang = normalizeLanguageSetting(settings.language, 'system');
      setLanguage(lang);
    });
  }, []);

  const options = getLanguageSettingOptions(resolveAppLanguageSetting(language, 'en'));

  async function handleNext() {
    await updateSettings({ language });
    setLocale(resolveAppLanguageSetting(language, 'en'));
    router.push('/onboarding/profile');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.left" size={20} color={palette.tint} />
            <ThemedText style={[styles.backLabel, { color: palette.tint }]}>
              {LL.onboarding.back()}
            </ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            {LL.onboarding.languageTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.languageSubtitle()}
          </ThemedText>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {options.map((option) => {
            const selected = language === option.value;
            return (
              <Pressable
                key={option.value}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor: selected ? palette.tint : palette.border,
                    borderWidth: selected ? 2 : 1,
                  },
                  pressed && styles.optionRowPressed,
                ]}
                onPress={() => setLanguage(normalizeLanguageSetting(option.value, 'system'))}
                android_ripple={{ color: palette.border }}
              >
                <ThemedText style={styles.optionLabel}>{option.label}</ThemedText>
                {selected && <IconSymbol name="checkmark" size={18} color={palette.tint} />}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.tint }]}
            onPress={handleNext}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
              {LL.onboarding.next()}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24 },
  header: { paddingTop: 16, paddingBottom: 24, gap: 8 },
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
  list: { flex: 1 },
  listContent: { gap: 8, paddingBottom: 8 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  optionRowPressed: { opacity: 0.75 },
  optionLabel: { fontSize: 16 },
  footer: { paddingVertical: 16 },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
});
