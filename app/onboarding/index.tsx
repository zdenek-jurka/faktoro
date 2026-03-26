import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

export default function OnboardingWelcomeScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();

  async function handleSkip() {
    await setOnboardingCompleted();
    router.replace('/(tabs)/time-tracking');
  }

  function handleStart() {
    router.push('/onboarding/start');
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <ThemedText style={styles.appName}>Faktoro</ThemedText>
          <ThemedText type="title" style={styles.title}>
            {LL.onboarding.welcomeTitle()}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
            {LL.onboarding.welcomeSubtitle()}
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.tint }]}
            onPress={handleStart}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
              {LL.onboarding.startSetup()}
            </ThemedText>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={handleSkip}
            android_ripple={{ color: palette.border }}
          >
            <ThemedText style={[styles.secondaryButtonText, { color: palette.textMuted }]}>
              {LL.onboarding.skipGuide()}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  appName: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    opacity: 0.5,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
  },
});
