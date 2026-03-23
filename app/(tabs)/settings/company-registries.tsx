import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  COMPANY_REGISTRY_OPTIONS,
  getRegistryLabel,
} from '@/components/clients/company-registry-lookup';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  type CompanyRegistryKey,
  normalizeCompanyRegistryKey,
} from '@/repositories/company-registry';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Pressable, View } from 'react-native';

const REGISTRY_OPTIONS: CompanyRegistryKey[] = ['none', ...COMPANY_REGISTRY_OPTIONS];

export default function SettingsCompanyRegistriesScreen() {
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const router = useRouter();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [defaultCompanyRegistry, setDefaultCompanyRegistry] = useState<CompanyRegistryKey>('none');

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setDefaultCompanyRegistry(normalizeCompanyRegistryKey(settings.defaultCompanyRegistry));
    };

    void loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await updateSettings({
        defaultCompanyRegistry,
      });

      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving company registry settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.companyRegistrySettingsTitle() }} />
      <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        <ThemedView
          style={[
            styles.section,
            { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
          ]}
        >
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {LL.settings.companyRegistryDefault()}
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            {LL.settings.companyRegistryDefaultDesc()}
          </ThemedText>
          <View
            style={[
              styles.selectCard,
              {
                borderColor: Colors[colorScheme ?? 'light'].inputBorder,
                backgroundColor: Colors[colorScheme ?? 'light'].inputBackground,
              },
            ]}
          >
            {REGISTRY_OPTIONS.map((registryKey, index) => {
              const isSelected = registryKey === defaultCompanyRegistry;
              return (
                <Pressable
                  key={registryKey}
                  style={({ pressed }) => [
                    styles.optionButton,
                    {
                      backgroundColor: isSelected
                        ? Colors[colorScheme ?? 'light'].infoBadgeBackground
                        : 'transparent',
                      opacity: pressed ? 0.82 : 1,
                    },
                    index < REGISTRY_OPTIONS.length - 1
                      ? {
                          borderBottomColor: Colors[colorScheme ?? 'light'].inputBorder,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        }
                      : null,
                  ]}
                  onPress={() => setDefaultCompanyRegistry(registryKey)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={getRegistryLabel(LL, registryKey)}
                >
                  <ThemedText
                    style={[
                      styles.optionText,
                      isSelected && {
                        color: Colors[colorScheme ?? 'light'].infoBadgeText,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {getRegistryLabel(LL, registryKey)}
                  </ThemedText>
                  {isSelected && (
                    <IconSymbol
                      name="checkmark"
                      size={18}
                      color={Colors[colorScheme ?? 'light'].tint}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </ThemedView>

        <Pressable
          style={[styles.row, { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground }]}
          onPress={() => router.push('/settings/company-registry-uk')}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold">
              {LL.settings.companyRegistryOptionUkCompaniesHouse()}
            </ThemedText>
            <ThemedText style={styles.rowSubtitle}>
              {LL.settings.companyRegistryApiKeyHelp()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={Colors[colorScheme ?? 'light'].icon} />
        </Pressable>

        <Pressable
          style={[styles.row, { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground }]}
          onPress={() => router.push('/settings/company-registry-fr')}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold">
              {LL.settings.companyRegistryOptionFrInsee()}
            </ThemedText>
            <ThemedText style={styles.rowSubtitle}>
              {LL.settings.companyRegistryApiTokenHelp()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={Colors[colorScheme ?? 'light'].icon} />
        </Pressable>

        <Pressable
          style={[styles.row, { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground }]}
          onPress={() => router.push('/settings/company-registry-custom')}
        >
          <View style={styles.rowContent}>
            <ThemedText type="defaultSemiBold">
              {LL.settings.companyRegistryOptionCustomConnector()}
            </ThemedText>
            <ThemedText style={styles.rowSubtitle}>
              {LL.settings.companyRegistryCustomConnectorHelp()}
            </ThemedText>
          </View>
          <IconSymbol name="chevron.right" size={20} color={Colors[colorScheme ?? 'light'].icon} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: Colors[colorScheme ?? 'light'].tint },
            pressed && styles.pressed,
          ]}
          onPress={() => void handleSave()}
        >
          <ThemedText
            style={[styles.saveButtonText, { color: Colors[colorScheme ?? 'light'].onTint }]}
          >
            {LL.common.save()}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    gap: 10,
  },
  section: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    marginBottom: 2,
  },
  sectionDescription: {
    fontSize: 13,
    opacity: 0.7,
  },
  selectCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  row: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowContent: {
    flex: 1,
    gap: 4,
    paddingRight: 10,
  },
  rowSubtitle: {
    fontSize: 13,
    opacity: 0.65,
  },
  saveButton: {
    marginTop: 6,
    borderRadius: 10,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
