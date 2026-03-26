import { ThemedText } from '@/components/themed-text';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getEuMemberStateLabel,
  getEuMemberStateOptions,
  normalizeEuMemberStateCode,
} from '@/constants/eu-countries';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import {
  type EuVatBootstrapPreview,
  type EuVatBootstrapRateKind,
  fetchEuVatBootstrapPreview,
} from '@/repositories/eu-vat-bootstrap-repository';
import { getSettings } from '@/repositories/settings-repository';
import { addVatRates, replaceAllVatRates } from '@/repositories/vat-rate-repository';
import { createBootstrapVatCodeToken, getLocalizedVatCodeName } from '@/utils/vat-code-utils';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

export default function OnboardingVatScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const switchColors = getSwitchColors(palette);
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const router = useRouter();

  const [bootstrapCountry, setBootstrapCountry] = useState('');
  const [bootstrapPreview, setBootstrapPreview] = useState<EuVatBootstrapPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImported, setIsImported] = useState(false);
  const [replaceMode, setReplaceMode] = useState(true);

  const euCountryOptions = useMemo(() => getEuMemberStateOptions(locale), [locale]);

  useEffect(() => {
    getSettings().then((settings) => {
      const normalized = normalizeEuMemberStateCode(settings.invoiceCountry);
      if (normalized) setBootstrapCountry(normalized);
    });
  }, []);

  useEffect(() => {
    if (bootstrapPreview && bootstrapPreview.memberState !== bootstrapCountry) {
      setBootstrapPreview(null);
    }
  }, [bootstrapCountry, bootstrapPreview]);

  const bootstrapPreviewRows = useMemo(() => {
    if (!bootstrapPreview) return [];

    const totalByKind = bootstrapPreview.rates.reduce<Record<EuVatBootstrapRateKind, number>>(
      (acc, rate) => {
        acc[rate.kind] += 1;
        return acc;
      },
      { standard: 0, reduced: 0, superReduced: 0, parking: 0, exempt: 0 },
    );

    const seenByKind = {
      standard: 0,
      reduced: 0,
      superReduced: 0,
      parking: 0,
      exempt: 0,
    } satisfies Record<EuVatBootstrapRateKind, number>;

    return bootstrapPreview.rates.map((rate) => {
      seenByKind[rate.kind] += 1;
      const index = seenByKind[rate.kind];
      const total = totalByKind[rate.kind];
      const codeName = createBootstrapVatCodeToken(rate.kind, index, total, bootstrapCountry);
      return {
        ...rate,
        codeName,
        displayName: getLocalizedVatCodeName(codeName, LL),
      };
    });
  }, [LL, bootstrapPreview]);

  async function handleLoadPreview() {
    if (!bootstrapCountry) {
      Alert.alert(LL.common.error(), LL.settings.vatBootstrapCountryRequired());
      return;
    }
    setIsLoading(true);
    try {
      const preview = await fetchEuVatBootstrapPreview(bootstrapCountry);
      setBootstrapPreview(preview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(LL.common.error(), msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImport() {
    if (!bootstrapPreviewRows.length) return;
    setIsLoading(true);
    const rateItems = bootstrapPreviewRows.map((rate) => ({
      codeName: rate.codeName,
      countryCode: bootstrapCountry || null,
      matchNames: [rate.displayName],
      ratePercent: rate.ratePercent,
      validFrom: rate.validFrom,
    }));
    try {
      if (replaceMode) {
        await replaceAllVatRates(rateItems);
      } else {
        await addVatRates(rateItems);
      }
      setIsImported(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(LL.common.error(), msg);
    } finally {
      setIsLoading(false);
    }
  }

  const formattedLoadDate = bootstrapPreview
    ? new Date(bootstrapPreview.fetchedAt).toLocaleDateString(intlLocale)
    : '';
  const countryLabel = bootstrapPreview
    ? getEuMemberStateLabel(bootstrapPreview.memberState, locale)
    : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ScrollView
        style={styles.flex}
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
            {LL.onboarding.vatTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.vatSubtitle()}
          </ThemedText>
        </View>

        {isImported ? (
          <View
            style={[
              styles.successCard,
              { backgroundColor: palette.cardBackground, borderColor: palette.success },
            ]}
          >
            <IconSymbol name="checkmark.circle.fill" size={28} color={palette.success} />
            <View style={styles.successText}>
              <ThemedText type="defaultSemiBold">{LL.onboarding.vatImportSuccess()}</ThemedText>
              <ThemedText style={[styles.note, { color: palette.textSecondary }]}>
                {LL.onboarding.vatRatesConfiguredDesc()}
              </ThemedText>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
              {LL.settings.vatBootstrapCountryLabel()}
            </ThemedText>

            <EntityPickerField
              value={bootstrapCountry}
              onValueChange={(val) => setBootstrapCountry(val)}
              title={LL.settings.vatBootstrapCountryLabel()}
              placeholder={LL.settings.vatBootstrapCountryPlaceholder()}
              searchPlaceholder={LL.settings.vatBootstrapCountrySearchPlaceholder()}
              emptyText={LL.settings.vatBootstrapCountryEmpty()}
              emptySearchText={LL.settings.vatBootstrapCountryEmptySearch()}
              options={euCountryOptions}
            />

            <Pressable
              style={[
                styles.loadButton,
                {
                  backgroundColor: bootstrapCountry
                    ? palette.tint
                    : palette.buttonNeutralBackground,
                },
              ]}
              onPress={handleLoadPreview}
              disabled={isLoading || !bootstrapCountry}
            >
              {isLoading && !bootstrapPreview ? (
                <ActivityIndicator size="small" color={palette.onTint} />
              ) : (
                <ThemedText
                  style={[
                    styles.loadButtonText,
                    { color: bootstrapCountry ? palette.onTint : palette.textMuted },
                  ]}
                >
                  {LL.settings.vatBootstrapPreviewAction()}
                </ThemedText>
              )}
            </Pressable>

            {bootstrapPreview && bootstrapPreviewRows.length > 0 && (
              <View style={[styles.previewCard, { borderColor: palette.border }]}>
                <ThemedText type="defaultSemiBold">
                  {LL.onboarding.vatLoadedFor({ country: countryLabel })}
                </ThemedText>
                <ThemedText style={[styles.note, { color: palette.textSecondary }]}>
                  {LL.onboarding.vatLoadedOn({ date: formattedLoadDate })}
                </ThemedText>
                {bootstrapPreviewRows.map((row, i) => (
                  <View key={i} style={[styles.rateRow, { borderTopColor: palette.border }]}>
                    <ThemedText style={styles.rateName}>{row.displayName}</ThemedText>
                    <ThemedText style={[styles.ratePercent, { color: palette.tint }]}>
                      {row.ratePercent} %
                    </ThemedText>
                  </View>
                ))}
                <View style={styles.switchRow}>
                  <ThemedText style={[styles.switchLabel, { color: palette.text }]}>
                    {LL.settings.vatBootstrapReplaceSwitch()}
                  </ThemedText>
                  <Switch
                    value={replaceMode}
                    onValueChange={setReplaceMode}
                    trackColor={switchColors.trackColor}
                    ios_backgroundColor={switchColors.ios_backgroundColor}
                  />
                </View>
                <Pressable
                  style={[styles.importButton, { backgroundColor: palette.tint }]}
                  onPress={handleImport}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={palette.onTint} />
                  ) : (
                    <ThemedText style={[styles.importButtonText, { color: palette.onTint }]}>
                      {replaceMode
                        ? LL.settings.vatBootstrapImportAction()
                        : LL.settings.vatBootstrapAddImportAction()}
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.tint }]}
            onPress={() => router.push('/onboarding/currency')}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
              {LL.onboarding.next()}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.skipButton} onPress={() => router.push('/onboarding/currency')}>
            <ThemedText style={[styles.skipText, { color: palette.textMuted }]}>
              {LL.onboarding.vatSkipButton()}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
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
  card: { borderRadius: 14, padding: 16, gap: 12 },
  fieldLabel: { fontSize: 13 },
  loadButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadButtonText: { fontSize: 15, fontWeight: '600' },
  previewCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rateName: { fontSize: 14 },
  ratePercent: { fontSize: 14, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 14,
    flex: 1,
  },
  importButton: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  importButtonText: { fontSize: 15, fontWeight: '600' },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
  },
  successText: { flex: 1, gap: 4 },
  note: { fontSize: 13, lineHeight: 18 },
  actions: { gap: 12, marginTop: 8 },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
  skipButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 15 },
});
