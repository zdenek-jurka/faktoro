import {
  canConvertCzBankAccountToIban,
  isIbanLike,
} from '@/components/settings/invoice-settings-shared';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { isPlausibleEmail } from '@/utils/email-utils';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingInvoiceProfileScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const router = useRouter();

  const [isVatPayer, setIsVatPayer] = useState(false);
  const [country, setCountry] = useState('');
  const [registrationNote, setRegistrationNote] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [iban, setIban] = useState('');
  const [swift, setSwift] = useState('');

  useEffect(() => {
    getSettings().then((settings) => {
      setIsVatPayer(!!settings.isVatPayer);
      setCountry(settings.invoiceCountry || '');
      setRegistrationNote(settings.invoiceRegistrationNote || '');
      setEmail(settings.invoiceEmail || '');
      setPhone(settings.invoicePhone || '');
      setWebsite(settings.invoiceWebsite || '');
      setBankAccount(settings.invoiceBankAccount || '');
      setIban(settings.invoiceIban || '');
      setSwift(settings.invoiceSwift || '');
    });
  }, []);

  const goNext = () => {
    if (isVatPayer) {
      router.push({
        pathname: '/onboarding/vat',
        params: country.trim() ? { bootstrapCountry: country.trim() } : undefined,
      });
      return;
    }
    router.push('/onboarding/currency');
  };

  const handleSkip = () => {
    goNext();
  };

  const handleSave = async () => {
    if (email.trim() && !isPlausibleEmail(email)) {
      Alert.alert(LL.common.error(), LL.common.errorInvalidEmail());
      return;
    }
    if (iban.trim() && !isIbanLike(iban)) {
      Alert.alert(LL.common.error(), LL.settings.invoiceQrBankRequiredSwiss());
      return;
    }
    if (bankAccount.trim() && !canConvertCzBankAccountToIban(bankAccount)) {
      console.warn('Invoice bank account is not convertible to IBAN');
    }

    await updateSettings({
      invoiceRegistrationNote: registrationNote.trim() || null,
      invoiceEmail: email.trim() || null,
      invoicePhone: phone.trim() || null,
      invoiceWebsite: website.trim() || null,
      invoiceBankAccount: bankAccount.trim() || null,
      invoiceIban: iban.trim() || null,
      invoiceSwift: swift.trim() || null,
    });
    goNext();
  };

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
            {LL.onboarding.invoiceProfileTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.invoiceProfileSubtitle()}
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: palette.cardBackground }]}>
          <TextInput
            style={[styles.input, styles.multilineInput, stylesField(palette)]}
            placeholder={LL.settings.invoiceRegistrationNote()}
            placeholderTextColor={palette.placeholder}
            value={registrationNote}
            onChangeText={setRegistrationNote}
            multiline
            textAlignVertical="top"
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.email()}
            placeholderTextColor={palette.placeholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.phone()}
            placeholderTextColor={palette.placeholder}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.website()}
            placeholderTextColor={palette.placeholder}
            value={website}
            onChangeText={setWebsite}
            keyboardType="url"
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.bankAccount()}
            placeholderTextColor={palette.placeholder}
            value={bankAccount}
            onChangeText={setBankAccount}
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.iban()}
            placeholderTextColor={palette.placeholder}
            value={iban}
            onChangeText={setIban}
            autoCapitalize="characters"
          />
          <TextInput
            style={[styles.input, stylesField(palette)]}
            placeholder={LL.settings.swift()}
            placeholderTextColor={palette.placeholder}
            value={swift}
            onChangeText={setSwift}
            autoCapitalize="characters"
          />
        </View>

        <ThemedText style={[styles.note, { color: palette.textMuted }]}>
          {LL.onboarding.invoiceProfileOptionalNote()}
        </ThemedText>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.tint }]}
            onPress={handleSave}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
              {LL.onboarding.invoiceProfileSaveContinue()}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, { borderColor: palette.border }]}
            onPress={handleSkip}
            android_ripple={{ color: palette.border }}
          >
            <ThemedText style={[styles.secondaryButtonText, { color: palette.text }]}>
              {LL.onboarding.invoiceProfileSkip()}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function stylesField(palette: ReturnType<typeof usePalette>) {
  return {
    backgroundColor: palette.inputBackground,
    borderColor: palette.inputBorder,
    color: palette.text,
  };
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
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 86,
  },
  note: { fontSize: 13, lineHeight: 18 },
  actions: { gap: 10 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
