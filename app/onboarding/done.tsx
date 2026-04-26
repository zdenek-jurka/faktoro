import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { getVatRates } from '@/repositories/vat-rate-repository';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { getSettings } from '@/repositories/settings-repository';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingDoneScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ vatConfigured?: string | string[] }>();

  const [hasVatWarning, setHasVatWarning] = useState(false);
  const vatConfiguredParam = Array.isArray(params.vatConfigured)
    ? params.vatConfigured[0]
    : params.vatConfigured;

  useEffect(() => {
    let cancelled = false;
    const checkVat = async () => {
      const settings = await getSettings();
      if (!settings.isVatPayer) {
        if (!cancelled) setHasVatWarning(false);
        return;
      }
      if (vatConfiguredParam === '1') {
        if (!cancelled) setHasVatWarning(false);
        return;
      }
      const rates = await getVatRates().fetch();
      if (!cancelled) setHasVatWarning(rates.length === 0);
    };
    void checkVat();
    return () => {
      cancelled = true;
    };
  }, [vatConfiguredParam]);

  async function handleFinish() {
    await setOnboardingCompleted();
    router.replace('/(tabs)/time-tracking');
  }

  async function handleGoToClients() {
    await setOnboardingCompleted();
    router.replace('/(tabs)/clients');
  }

  async function handleGoToPriceList() {
    await setOnboardingCompleted();
    router.replace('/(tabs)/price-list');
  }

  async function handleGoToVatSettings() {
    await setOnboardingCompleted();
    router.replace('/(tabs)/settings/vat');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.checkCircle, { backgroundColor: palette.success }]}>
            <IconSymbol name="checkmark" size={36} color="#fff" />
          </View>
          <ThemedText type="title" style={styles.title}>
            {LL.onboarding.doneTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.doneSubtitle()}
          </ThemedText>
        </View>

        {/* VAT warning */}
        {hasVatWarning && (
          <View
            style={[styles.warningCard, { backgroundColor: '#fff3cd', borderColor: '#ffc107' }]}
          >
            <IconSymbol
              name="exclamationmark.triangle.fill"
              size={20}
              color="#856404"
              style={styles.warningIcon}
            />
            <View style={styles.warningBody}>
              <ThemedText style={[styles.warningText, { color: '#856404' }]}>
                {LL.onboarding.doneVatWarning()}
              </ThemedText>
              <Pressable onPress={handleGoToVatSettings} hitSlop={8}>
                <ThemedText style={styles.warningLink}>
                  {LL.onboarding.doneVatSettingsLink()}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Action cards */}
        <View style={styles.actionCards}>
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              { backgroundColor: palette.cardBackground, borderColor: palette.border },
              pressed && styles.actionCardPressed,
            ]}
            onPress={handleGoToClients}
            android_ripple={{ color: palette.border }}
          >
            <View style={[styles.actionCardIcon, { backgroundColor: palette.backgroundSubtle }]}>
              <IconSymbol name="person.2.fill" size={24} color={palette.tint} />
            </View>
            <View style={styles.actionCardText}>
              <ThemedText type="defaultSemiBold">{LL.onboarding.doneAddClient()}</ThemedText>
              <ThemedText style={[styles.actionCardDesc, { color: palette.textSecondary }]}>
                {LL.onboarding.doneAddClientDesc()}
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color={palette.icon} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              { backgroundColor: palette.cardBackground, borderColor: palette.border },
              pressed && styles.actionCardPressed,
            ]}
            onPress={handleGoToPriceList}
            android_ripple={{ color: palette.border }}
          >
            <View style={[styles.actionCardIcon, { backgroundColor: palette.backgroundSubtle }]}>
              <IconSymbol name="list.bullet.rectangle" size={24} color={palette.tint} />
            </View>
            <View style={styles.actionCardText}>
              <ThemedText type="defaultSemiBold">{LL.onboarding.donePriceList()}</ThemedText>
              <ThemedText style={[styles.actionCardDesc, { color: palette.textSecondary }]}>
                {LL.onboarding.donePriceListDesc()}
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color={palette.icon} />
          </Pressable>
        </View>

        {/* Primary CTA */}
        <Pressable
          style={[styles.primaryButton, { backgroundColor: palette.tint }]}
          onPress={handleFinish}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
        >
          <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
            {LL.onboarding.doneGoToApp()}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40, gap: 24 },
  hero: { alignItems: 'center', gap: 16, paddingTop: 24 },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 32, textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningIcon: { marginTop: 2 },
  warningBody: { flex: 1, gap: 8 },
  warningText: { fontSize: 14, lineHeight: 20 },
  warningLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    textDecorationLine: 'underline',
  },
  actionCards: { gap: 12 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionCardPressed: { opacity: 0.75 },
  actionCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardText: { flex: 1, gap: 4 },
  actionCardDesc: { fontSize: 13, lineHeight: 18 },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 17, fontWeight: '600' },
});
