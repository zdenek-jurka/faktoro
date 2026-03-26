import { CompanyRegistryPickerModal } from '@/components/clients/company-registry-picker-modal';
import { loadRegistrySettingsForLookup } from '@/components/clients/company-registry-lookup';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, getSwitchColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import {
  CompanyRegistryLookupError,
  getCompanyRegistryService,
  type CompanyRegistryKey,
} from '@/repositories/company-registry';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

/** Registries that work without any extra configuration. */
const FREE_REGISTRY_KEYS: CompanyRegistryKey[] = ['ares', 'no_brreg', 'ee_ariregister'];

export default function OnboardingProfileScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const switchColors = getSwitchColors(palette);
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const router = useRouter();
  const headerHeight = useHeaderHeight();

  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [country, setCountry] = useState('');

  const countryName = useMemo(() => {
    const code = country.trim().toUpperCase();
    if (code.length !== 2) return null;
    try {
      return new Intl.DisplayNames([intlLocale, 'en'], { type: 'region' }).of(code) ?? null;
    } catch {
      return null;
    }
  }, [country, intlLocale]);
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [registryPickerVisible, setRegistryPickerVisible] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setCompanyName(s.invoiceCompanyName || '');
      setCompanyId(s.invoiceCompanyId || '');
      setCountry(s.invoiceCountry || '');
      setIsVatPayer(s.isVatPayer || false);
    });
  }, []);

  function handleLookup() {
    if (!companyId.trim()) return;
    setRegistryPickerVisible(true);
  }

  async function handleRegistrySelected(registryKey: CompanyRegistryKey) {
    const trimmedId = companyId.trim();
    setIsLookingUp(true);
    try {
      const registrySettings = await loadRegistrySettingsForLookup(registryKey);
      const service = getCompanyRegistryService(registryKey, registrySettings);
      if (!service) return;
      const company = await service.lookupCompanyById(trimmedId);
      if (company.legalName) setCompanyName(company.legalName);
      const resolvedCountry = company.countryCode || service.countryCode;
      if (resolvedCountry) setCountry(resolvedCountry);
      if (company.vatNumber?.trim()) setIsVatPayer(true);
    } catch (err) {
      if (err instanceof CompanyRegistryLookupError && err.code === 'company_not_found') {
        Alert.alert(LL.common.error(), LL.clients.errorCompanyNotFoundInRegistry());
      } else if (err instanceof CompanyRegistryLookupError && err.code === 'invalid_company_id') {
        Alert.alert(LL.common.error(), LL.clients.errorInvalidCompanyIdForLookup());
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert(LL.common.error(), msg);
      }
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleNext() {
    await updateSettings({
      invoiceCompanyName: companyName.trim() || null,
      invoiceCompanyId: companyId.trim() || null,
      invoiceCountry: country.trim() || null,
      isVatPayer,
    });

    if (isVatPayer) {
      router.push('/onboarding/vat');
    } else {
      router.push('/onboarding/currency');
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
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
              {LL.onboarding.profileTitle()}
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
              {LL.onboarding.profileSubtitle()}
            </ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
            {/* Company name */}
            <View style={styles.field}>
              <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                {LL.settings.companyName()} *
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
                value={companyName}
                onChangeText={setCompanyName}
                placeholder={LL.settings.companyName()}
                placeholderTextColor={palette.placeholder}
                autoCapitalize="words"
              />
            </View>

            {/* Company ID + lookup button */}
            <View style={styles.field}>
              <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                {LL.settings.companyId()}
              </ThemedText>
              <View style={styles.lookupRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputFlex,
                    {
                      backgroundColor: palette.inputBackground,
                      borderColor: palette.inputBorder,
                      color: palette.text,
                    },
                  ]}
                  value={companyId}
                  onChangeText={setCompanyId}
                  placeholder={LL.settings.companyId()}
                  placeholderTextColor={palette.placeholder}
                  keyboardType="default"
                />
                <Pressable
                  style={[
                    styles.lookupButton,
                    {
                      backgroundColor: companyId.trim()
                        ? palette.tint
                        : palette.buttonNeutralBackground,
                    },
                  ]}
                  onPress={handleLookup}
                  disabled={isLookingUp || !companyId.trim()}
                >
                  {isLookingUp ? (
                    <ActivityIndicator size="small" color={palette.onTint} />
                  ) : (
                    <IconSymbol
                      name="magnifyingglass"
                      size={18}
                      color={companyId.trim() ? palette.onTint : palette.icon}
                    />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Country — read-only, filled from registry lookup */}
            {countryName ? (
              <View style={styles.field}>
                <ThemedText style={[styles.fieldLabel, { color: palette.textSecondary }]}>
                  {LL.onboarding.profileCountryLabel()}
                </ThemedText>
                <View
                  style={[
                    styles.countryBadge,
                    { backgroundColor: palette.inputBackground, borderColor: palette.inputBorder },
                  ]}
                >
                  <ThemedText style={styles.countryBadgeText}>{countryName}</ThemedText>
                </View>
              </View>
            ) : null}

            {/* VAT payer toggle */}
            <View style={[styles.field, styles.switchField]}>
              <ThemedText style={styles.fieldLabelInline}>{LL.settings.isVatPayer()}</ThemedText>
              <Switch
                value={isVatPayer}
                onValueChange={setIsVatPayer}
                trackColor={switchColors.trackColor}
                ios_backgroundColor={switchColors.ios_backgroundColor}
              />
            </View>
          </View>

          <ThemedText style={[styles.note, { color: palette.textMuted }]}>
            {LL.onboarding.profileNote()}
          </ThemedText>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.tint }]}
            onPress={handleNext}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
              {LL.onboarding.next()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <CompanyRegistryPickerModal
        visible={registryPickerVisible}
        LL={LL}
        options={FREE_REGISTRY_KEYS}
        onClose={() => setRegistryPickerVisible(false)}
        onSelect={(key) => {
          setRegistryPickerVisible(false);
          void handleRegistrySelected(key);
        }}
      />
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
  card: { borderRadius: 14, padding: 16, gap: 16 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13 },
  fieldLabelInline: { fontSize: 16, flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputFlex: { flex: 1 },
  countryBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countryBadgeText: { fontSize: 16 },
  lookupRow: { flexDirection: 'row', gap: 8 },
  lookupButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  note: { fontSize: 13, lineHeight: 18 },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
});
