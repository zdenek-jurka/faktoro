import { ThemedText } from '@/components/themed-text';
import { withOpacity } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { setOnboardingCompleted } from '@/repositories/onboarding-repository';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingWelcomeScreen() {
  const colorScheme = useColorScheme();
  const palette = usePalette();
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
          <View
            style={[
              styles.heroMarkShell,
              {
                backgroundColor: palette.cardBackground,
                borderColor: palette.border,
                shadowColor: palette.tint,
              },
            ]}
          >
            <View
              style={[
                styles.heroMarkGlow,
                {
                  backgroundColor: withOpacity(palette.tint, colorScheme === 'dark' ? 0.28 : 0.18),
                },
              ]}
            />
            <View
              style={[
                styles.heroMarkPlate,
                {
                  backgroundColor: withOpacity(palette.tint, colorScheme === 'dark' ? 0.2 : 0.1),
                },
              ]}
            >
              <Image
                source={require('../../assets/images/faktoro-mark.png')}
                style={styles.heroMarkImage}
                resizeMode="contain"
              />
            </View>
          </View>
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
            <ThemedText
              style={[styles.primaryButtonText, { color: palette.onTint }]}
              numberOfLines={2}
            >
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
  heroMarkShell: {
    width: 108,
    height: 108,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 6,
  },
  heroMarkGlow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 999,
  },
  heroMarkPlate: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMarkImage: {
    width: 48,
    height: 48,
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
    minHeight: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButtonText: {
    width: '100%',
    maxWidth: '100%',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    includeFontPadding: false,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
