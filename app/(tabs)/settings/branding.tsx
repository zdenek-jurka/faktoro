import {
  deletePersistedLogoUri,
  persistPickedLogoOffline,
  persistLogoUriOffline,
} from '@/components/settings/invoice-settings-shared';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { getSettings, updateSettings } from '@/repositories/settings-repository';
import {
  buildInvoiceLogoDataUri,
  formatInvoiceLogoSizeLimit,
  INVOICE_LOGO_TOO_LARGE_ERROR,
  MAX_SYNCED_INVOICE_LOGO_BYTES,
  readInvoiceLogoPayloadFromUri,
} from '@/utils/invoice-logo';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

export default function SettingsBrandingScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [invoiceLogoUri, setInvoiceLogoUri] = useState('');
  const [invoiceLogoBase64, setInvoiceLogoBase64] = useState('');
  const [invoiceLogoMimeType, setInvoiceLogoMimeType] = useState('');
  const maxLogoSize = formatInvoiceLogoSizeLimit(MAX_SYNCED_INVOICE_LOGO_BYTES);
  const logoPreviewUri =
    buildInvoiceLogoDataUri(invoiceLogoBase64, invoiceLogoMimeType) || invoiceLogoUri;

  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      setInvoiceLogoUri(settings.invoiceLogoUri || '');
      setInvoiceLogoBase64(settings.invoiceLogoBase64 || '');
      setInvoiceLogoMimeType(settings.invoiceLogoMimeType || '');
    };

    void loadSettings();
  }, []);

  const showInvoiceLogoTooLargeAlert = () => {
    Alert.alert(LL.common.error(), LL.settings.invoiceLogoTooLarge({ maxSize: maxLogoSize }));
  };

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

      const asset = result.assets[0];
      const payload = await readInvoiceLogoPayloadFromUri(asset.uri, {
        maxBytes: MAX_SYNCED_INVOICE_LOGO_BYTES,
        sourceMimeType: asset.mimeType,
      });
      const persistedLogoUri = await persistPickedLogoOffline(asset);

      setInvoiceLogoUri(persistedLogoUri);
      setInvoiceLogoBase64(payload.base64);
      setInvoiceLogoMimeType(payload.mimeType);
    } catch (error) {
      if (error instanceof Error && error.message === INVOICE_LOGO_TOO_LARGE_ERROR) {
        showInvoiceLogoTooLargeAlert();
        return;
      }

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
    setInvoiceLogoBase64('');
    setInvoiceLogoMimeType('');
  };

  const handleSave = async () => {
    try {
      let resolvedLogoBase64 = invoiceLogoBase64.trim();
      let resolvedLogoMimeType = invoiceLogoMimeType.trim();
      const trimmedLogoUri = invoiceLogoUri.trim();
      let localLogoUri = trimmedLogoUri;

      if (trimmedLogoUri && !resolvedLogoBase64) {
        localLogoUri = await persistLogoUriOffline(trimmedLogoUri);
      }

      if (localLogoUri && !resolvedLogoBase64) {
        const payload = await readInvoiceLogoPayloadFromUri(localLogoUri, {
          maxBytes: MAX_SYNCED_INVOICE_LOGO_BYTES,
          sourceMimeType: resolvedLogoMimeType,
        });
        resolvedLogoBase64 = payload.base64;
        resolvedLogoMimeType = payload.mimeType;
      }

      await updateSettings({
        invoiceLogoUri: localLogoUri || null,
        invoiceLogoBase64: resolvedLogoBase64 || null,
        invoiceLogoMimeType: resolvedLogoMimeType || null,
      });
      if (localLogoUri && localLogoUri !== invoiceLogoUri) {
        setInvoiceLogoUri(localLogoUri);
      }
      setInvoiceLogoBase64(resolvedLogoBase64);
      setInvoiceLogoMimeType(resolvedLogoMimeType);
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      if (error instanceof Error && error.message === INVOICE_LOGO_TOO_LARGE_ERROR) {
        showInvoiceLogoTooLargeAlert();
        return;
      }

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
          <ThemedView style={[styles.section, sectionCard(palette)]}>
            <ThemedText style={styles.sectionDescription}>
              {LL.settings.brandingSubtitle()}
            </ThemedText>
            <ThemedText style={styles.label}>{LL.settings.invoiceLogo()}</ThemedText>
            <ThemedText style={styles.hintText}>
              {LL.settings.invoiceLogoHelp({ maxSize: maxLogoSize })}
            </ThemedText>
            {logoPreviewUri ? (
              <>
                <View
                  style={[
                    styles.logoPreviewFrame,
                    {
                      borderColor: palette.inputBorder,
                      backgroundColor: withOpacity(palette.tint, 0.06),
                    },
                  ]}
                >
                  <Image
                    source={{ uri: logoPreviewUri }}
                    style={styles.logoPreviewImage}
                    contentFit="contain"
                    transition={120}
                  />
                </View>
                <View style={styles.logoActionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      { backgroundColor: palette.tint },
                      pressed && styles.pressed,
                    ]}
                    onPress={handlePickInvoiceLogo}
                  >
                    <ThemedText style={[styles.logoActionButtonText, { color: palette.onTint }]}>
                      {LL.settings.invoiceLogoReplace()}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.logoActionButton,
                      {
                        borderColor: palette.inputBorder,
                        backgroundColor: palette.inputBackground,
                        borderWidth: 1,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={handleRemoveInvoiceLogo}
                  >
                    <ThemedText style={[styles.logoActionButtonText, { color: palette.text }]}>
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
                    borderColor: palette.inputBorder,
                    backgroundColor: palette.inputBackground,
                  },
                  pressed && styles.pressed,
                ]}
                onPress={handlePickInvoiceLogo}
              >
                <ThemedText type="defaultSemiBold" style={{ color: palette.tint }}>
                  {LL.settings.invoiceLogoChoose()}
                </ThemedText>
              </Pressable>
            )}
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: palette.tint },
              pressed && styles.pressed,
            ]}
            onPress={handleSave}
          >
            <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
              {LL.common.save()}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function sectionCard(palette: ReturnType<typeof usePalette>) {
  return {
    backgroundColor: palette.cardBackground,
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
