import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  getRegistrySetting,
  upsertRegistrySetting,
} from '@/repositories/registry-settings-repository';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, Pressable } from 'react-native';

type RegistryField = {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
};

type Props = {
  registryKey: string;
  fields: RegistryField[];
  infoSection?: {
    title: string;
    description: string;
    example?: string;
    docHint?: string;
  };
};

export function RegistrySettingsForm({ registryKey, fields, infoSection }: Props) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const entries = await Promise.all(
        fields.map(async (field) => {
          const value = await getRegistrySetting(registryKey, field.key);
          return [field.key, value || ''] as const;
        }),
      );
      setValues(Object.fromEntries(entries));
    };
    void load();
  }, [fields, registryKey]);

  const handleSave = async () => {
    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) {
        Alert.alert(
          LL.common.error(),
          LL.settings.companyRegistryRequiredField({ field: field.label }),
        );
        return;
      }
    }

    try {
      await Promise.all(
        fields.map((field) =>
          upsertRegistrySetting(registryKey, field.key, values[field.key] || ''),
        ),
      );
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving registry settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={styles.content}>
      {fields.map((field) => (
        <ThemedView
          key={field.key}
          style={[styles.section, { backgroundColor: palette.cardBackground }]}
        >
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {field.label}
          </ThemedText>
          {!!field.help && <ThemedText style={styles.sectionDescription}>{field.help}</ThemedText>}
          <TextInput
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: palette.inputBorder,
                backgroundColor: palette.inputBackground,
              },
            ]}
            placeholder={field.placeholder || field.label}
            placeholderTextColor={palette.placeholder}
            value={values[field.key] || ''}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </ThemedView>
      ))}

      {infoSection && (
        <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {infoSection.title}
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>{infoSection.description}</ThemedText>
          {!!infoSection.example && (
            <ThemedText style={styles.codeBlock}>{infoSection.example}</ThemedText>
          )}
          {!!infoSection.docHint && (
            <ThemedText style={styles.sectionHint}>{infoSection.docHint}</ThemedText>
          )}
        </ThemedView>
      )}

      <Pressable
        style={[styles.saveButton, { backgroundColor: palette.tint }]}
        onPress={handleSave}
        accessibilityRole="button"
        accessibilityLabel={LL.common.save()}
      >
        <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
          {LL.common.save()}
        </ThemedText>
      </Pressable>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  sectionHint: { fontSize: 12, opacity: 0.7, marginTop: 10 },
  codeBlock: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.9,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
});
