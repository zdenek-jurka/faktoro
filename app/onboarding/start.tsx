import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isSyncEnabled } from '@/constants/features';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

type ChoiceItem = {
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
};

export default function OnboardingStartScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const router = useRouter();

  const choices: ChoiceItem[] = [
    {
      icon: 'sparkles',
      title: LL.onboarding.startNewTitle(),
      description: LL.onboarding.startNewDesc(),
      onPress: () => router.push('/onboarding/language'),
    },
    ...(isSyncEnabled
      ? [
          {
            icon: 'arrow.triangle.2.circlepath',
            title: LL.onboarding.startDeviceTitle(),
            description: LL.onboarding.startDeviceDesc(),
            onPress: () => router.push('/onboarding/connect'),
          } satisfies ChoiceItem,
        ]
      : []),
    {
      icon: 'archivebox',
      title: LL.onboarding.startRestoreTitle(),
      description: LL.onboarding.startRestoreDesc(),
      onPress: () => router.push('/onboarding/restore'),
    },
  ];

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
            {LL.onboarding.startTitle()}
          </ThemedText>
        </View>

        <View style={styles.choices}>
          {choices.map((choice, index) => (
            <Pressable
              key={index}
              style={({ pressed }) => [
                styles.choiceCard,
                {
                  backgroundColor: palette.cardBackground,
                  borderColor: palette.border,
                },
                pressed && styles.choiceCardPressed,
              ]}
              onPress={choice.onPress}
              android_ripple={{ color: palette.border }}
            >
              <View style={[styles.choiceIcon, { backgroundColor: palette.backgroundSubtle }]}>
                <IconSymbol name={choice.icon as any} size={28} color={palette.tint} />
              </View>
              <View style={styles.choiceText}>
                <ThemedText type="defaultSemiBold" style={styles.choiceTitle}>
                  {choice.title}
                </ThemedText>
                <ThemedText style={[styles.choiceDesc, { color: palette.textSecondary }]}>
                  {choice.description}
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={palette.icon} />
            </Pressable>
          ))}
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
  },
  header: {
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 16,
  },
  title: {
    fontSize: 28,
  },
  choices: {
    gap: 12,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  choiceCardPressed: {
    opacity: 0.75,
  },
  choiceIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: {
    flex: 1,
    gap: 4,
  },
  choiceTitle: {
    fontSize: 16,
  },
  choiceDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
});
