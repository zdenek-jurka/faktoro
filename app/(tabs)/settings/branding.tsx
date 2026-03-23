import {
  deletePersistedLogoUri,
  persistPickedLogoOffline,
  persistLogoUriOffline,
} from '@/components/settings/invoice-settings-shared';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function SettingsBrandingScreen() {
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [invoiceLogoUri, setInvoiceLogoUri] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setInvoiceLogoUri(settings.invoiceLogoUri || '');
    };

    void loadSettings();
  }, []);

  const handlePickInvoiceLogo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(LL.common.error(), LL.settings.invoiceLogoPermissionDenied());
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });

      if (result.canceled || !result.assets?.length) return;

      const persistedLogoUri = await persistPickedLogoOffline(result.assets[0]);
      setInvoiceLogoUri(persistedLogoUri);
    } catch (error) {
      console.error('Error picking invoice logo:', error);
      Alert.alert(LL.common.error(), LL.settings.invoiceLogoPickError());
    }
  };

  const handleRemoveInvoiceLogo = async () => {
    try {
      await deletePersistedLogoUri(invoiceLogoUri);
    } catch (error) {
      console.error('Error removing invoice logo:', error);
    }
    setInvoiceLogoUri('');
  };

  const handleSave = async () => {
    try {
      const localLogoUri = await persistLogoUriOffline(invoiceLogoUri);
      await updateSettings({
        invoiceLogoUri: localLogoUri || null,
      });
      if (localLogoUri && localLogoUri !== invoiceLogoUri) {
        setInvoiceLogoUri(localLogoUri);
      }
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving branding settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.brandingTitle() }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={contentStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <ThemedView style={[styles.section, sectionCard(colorScheme)]}>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.brandingSubtitle()}
            </ThemedText>
            <ThemedText style={styles.label}>{LL.settings.invoiceLogo()}</ThemedText>
            <ThemedText style={styles.hintText}>{LL.settings.invoiceLogoHelp()}</ThemedText>
            {invoiceLogoUri ? (
              <>
                <View
                  style={[
                    styles.logoPreviewFrame,
                    {
                      borderColor: Colors[colorScheme ?? 'light'].inputBorder,
                      backgroundColor: withOpacity(Colors[colorScheme ?? 'light'].tint, 0.06),
                    },
                  ]}
                >
                  <Image
                    source={{ uri: invoiceLogoUri }}
                    style={styles.logoPreviewImage}
                    contentFit="contain"
                    transition={120}
                  />
                </View>
                <View style={styles.logoActionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      { backgroundColor: Colors[colorScheme ?? 'light'].tint },
                      pressed && styles.pressed,
                    ]}
                    onPress={handlePickInvoiceLogo}
                  >
                    <ThemedText
                      style={[
                        styles.logoActionButtonText,
                        { color: Colors[colorScheme ?? 'light'].onTint },
                      ]}
                    >
                      {LL.settings.invoiceLogoReplace()}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      {
                        borderColor: Colors[colorScheme ?? 'light'].inputBorder,
                        backgroundColor: Colors[colorScheme ?? 'light'].inputBackground,
                        borderWidth: 1,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={handleRemoveInvoiceLogo}
                  >
                    <ThemedText
                      style={[
                        styles.logoActionButtonText,
                        { color: Colors[colorScheme ?? 'light'].text },
                      ]}
                    >
                      {LL.settings.invoiceLogoRemove()}
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.logoPickerButton,
                  {
                    borderColor: Colors[colorScheme ?? 'light'].inputBorder,
                    backgroundColor: Colors[colorScheme ?? 'light'].inputBackground,
                  },
                  pressed && styles.pressed,
                ]}
                onPress={handlePickInvoiceLogo}
              >
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: Colors[colorScheme ?? 'light'].tint }}
                >
                  {LL.settings.invoiceLogoChoose()}
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: Colors[colorScheme ?? 'light'].tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText
              style={[styles.saveButtonText, { color: Colors[colorScheme ?? 'light'].onTint }]}
            >
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function sectionCard(colorScheme: ReturnType<typeof useColorScheme>) {
  return {
    backgroundColor: Colors[colorScheme ?? 'light'].cardBackground,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  label: { marginBottom: 8, fontWeight: '600' },
  hintText: { fontSize: 13, opacity: 0.65, marginBottom: 10 },
  logoPreviewFrame: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  logoPreviewImage: {
    width: '100%',
    height: 140,
  },
  logoActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  logoActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  logoActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  logoPickerButton: {
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.82 },
});
