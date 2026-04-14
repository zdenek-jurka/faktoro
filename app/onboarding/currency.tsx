import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import { DEFAULT_INVOICE_DUE_DAYS, parseInvoiceDueDaysInput } from '@/utils/invoice-defaults';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingCurrencyScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ vatConfigured?: string | string[] }>();
  const currencies = useCurrencySettings();

  const [selectedCurrency, setSelectedCurrency] = useState(DEFAULT_CURRENCY_CODE);
  const [dueDaysInput, setDueDaysInput] = useState(String(DEFAULT_INVOICE_DUE_DAYS));
  const vatConfiguredParam = Array.isArray(params.vatConfigured)
    ? params.vatConfigured[0]
    : params.vatConfigured;

  useEffect(() => {
    getSettings().then((s) => {
      if (s.defaultInvoiceCurrency) {
        setSelectedCurrency(normalizeCurrencyCode(s.defaultInvoiceCurrency, DEFAULT_CURRENCY_CODE));
      }
      if (s.defaultInvoiceDueDays != null) {
        setDueDaysInput(String(s.defaultInvoiceDueDays));
      }
    });
  }, []);

  async function handleNext() {
    const dueDays = parseInvoiceDueDaysInput(dueDaysInput) ?? DEFAULT_INVOICE_DUE_DAYS;
    await updateSettings({
      defaultInvoiceCurrency: selectedCurrency,
      defaultInvoiceDueDays: dueDays,
    });
    router.push({
      pathname: '/onboarding/done',
      params: vatConfiguredParam ? { vatConfigured: vatConfiguredParam } : undefined,
    });
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
            {LL.onboarding.currencyTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.currencySubtitle()}
          </ThemedText>
        </View>

        {/* Currency picker */}
        <View style={styles.currencyList}>
          {currencies.map((cur) => {
            const selected = selectedCurrency === cur.code;
            return (
              <Pressable
                key={cur.code}
                style={({ pressed }) => [
                  styles.currencyRow,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor: selected ? palette.tint : palette.border,
                    borderWidth: selected ? 2 : 1,
                  },
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setSelectedCurrency(cur.code)}
                android_ripple={{ color: palette.border }}
              >
                <View style={[styles.codeBadge, { backgroundColor: palette.infoBadgeBackground }]}>
                  <ThemedText style={[styles.codeText, { color: palette.infoBadgeText }]}>
                    {cur.code}
                  </ThemedText>
                </View>
                <ThemedText style={styles.currencyLabel}>
                  {cur.prefix || ''}
                  {cur.suffix ? `${cur.suffix}` : ''}
                </ThemedText>
                {selected && <IconSymbol name="checkmark" size={18} color={palette.tint} />}
              </Pressable>
            );
          })}
        </View>

        {/* Due days */}
        <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
          <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
            {LL.onboarding.dueDaysLabel()}
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
            value={dueDaysInput}
            onChangeText={setDueDaysInput}
            keyboardType="number-pad"
            placeholder={String(DEFAULT_INVOICE_DUE_DAYS)}
            placeholderTextColor={palette.placeholder}
          />
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: palette.tint }]}
          onPress={handleNext}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
            {LL.onboarding.next()}
          </ThemedText>
        </Pressable>
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
  currencyList: { gap: 8 },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
  },
  rowPressed: { opacity: 0.75 },
  codeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  codeText: { fontSize: 14, fontWeight: '700' },
  currencyLabel: { flex: 1, fontSize: 15 },
  card: { borderRadius: 14, padding: 16, gap: 8 },
  fieldLabel: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
});
