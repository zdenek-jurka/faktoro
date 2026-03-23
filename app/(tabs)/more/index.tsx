import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18nContext } from '@/i18n/i18n-react';
import { usePalette } from '@/hooks/use-palette';
import { getMoreSectionTitle } from '@/i18n/locale-options';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export default function MoreScreen() {
  const { LL, locale } = useI18nContext();
  const router = useRouter();
  const palette = usePalette();
  const screenTitle = getMoreSectionTitle(locale);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: screenTitle }} />

      <View style={styles.listContent}>
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: palette.cardBackground },
            pressed && styles.rowPressed,
          ]}
          onPress={() => router.push('/reports')}
          accessibilityRole="button"
          accessibilityLabel={LL.reports.title()}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
              {LL.reports.title()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={palette.icon} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: palette.cardBackground },
            pressed && styles.rowPressed,
          ]}
          onPress={() => router.push('/price-list')}
          accessibilityRole="button"
          accessibilityLabel={LL.tabs.priceList()}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
              {LL.tabs.priceList()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={palette.icon} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: palette.cardBackground },
            pressed && styles.rowPressed,
          ]}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={LL.tabs.settings()}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold" style={styles.rowTitle}>
              {LL.tabs.settings()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={palette.icon} />
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  row: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 17,
  },
});
