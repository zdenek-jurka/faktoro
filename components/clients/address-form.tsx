import React from 'react';
import { StyleSheet, Switch, TextInput, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSwitchColors } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { AddressType } from '@/db/schema';
import { AddressFormData } from './client-types';

interface AddressFormProps {
  formData: AddressFormData;
  onFormDataChange: (data: AddressFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEditMode?: boolean;
  isScreen?: boolean;
}

export function AddressForm({
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  isEditMode = false,
  isScreen = false,
}: AddressFormProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();

  const updateField = (field: keyof AddressFormData, value: string | boolean | AddressType) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const getAddressTypeLabel = (type: AddressType) => {
    switch (type) {
      case AddressType.BILLING:
        return LL.clients.addressTypeBilling();
      case AddressType.SHIPPING:
        return LL.clients.addressTypeShipping();
      case AddressType.OTHER:
        return LL.clients.addressTypeOther();
    }
  };

  return (
    <ThemedView
      style={[
        isScreen ? styles.formContainerScreen : styles.formContainer,
        { borderColor: palette.inputBorder },
      ]}
    >
      <ThemedText type="subtitle" style={styles.formTitle}>
        {isEditMode ? LL.clients.editAddress() : LL.clients.addAddress()}
      </ThemedText>

      <View style={styles.typeContainer}>
        <ThemedText style={styles.label}>{LL.clients.addressType()}</ThemedText>
        <View style={styles.typeButtons}>
          {Object.values(AddressType).map((type) => (
            <Pressable
              key={type}
              style={[
                styles.typeButton,
                { borderColor: palette.inputBorder },
                formData.type === type && { backgroundColor: palette.tint },
              ]}
              onPress={() => updateField('type', type)}
              accessibilityRole="button"
              accessibilityLabel={getAddressTypeLabel(type)}
            >
              <ThemedText
                style={[
                  styles.typeButtonText,
                  formData.type === type && styles.typeButtonTextActive,
                  formData.type === type && { color: palette.onTint },
                ]}
              >
                {getAddressTypeLabel(type)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.street() + ' *'}
        placeholderTextColor={palette.placeholder}
        value={formData.street}
        onChangeText={(text) => updateField('street', text)}
        accessibilityLabel={`${LL.clients.street()} *`}
      />

      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.street2()}
        placeholderTextColor={palette.placeholder}
        value={formData.street2}
        onChangeText={(text) => updateField('street2', text)}
        accessibilityLabel={LL.clients.street2()}
      />

      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            styles.halfInput,
            {
              color: palette.text,
              borderColor: palette.inputBorder,
            },
          ]}
          placeholder={LL.clients.city() + ' *'}
          placeholderTextColor={palette.placeholder}
          value={formData.city}
          onChangeText={(text) => updateField('city', text)}
          accessibilityLabel={`${LL.clients.city()} *`}
        />
        <TextInput
          style={[
            styles.input,
            styles.halfInput,
            {
              color: palette.text,
              borderColor: palette.inputBorder,
            },
          ]}
          placeholder={LL.clients.postalCode() + ' *'}
          placeholderTextColor={palette.placeholder}
          value={formData.postalCode}
          onChangeText={(text) => updateField('postalCode', text)}
          accessibilityLabel={`${LL.clients.postalCode()} *`}
        />
      </View>

      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.country()}
        placeholderTextColor={palette.placeholder}
        value={formData.country}
        onChangeText={(text) => updateField('country', text)}
        accessibilityLabel={LL.clients.country()}
      />

      <View style={styles.switchRow}>
        <ThemedText style={styles.switchLabel}>{LL.clients.setDefaultAddress()}</ThemedText>
        <Switch
          value={formData.isDefault}
          onValueChange={(value) => updateField('isDefault', value)}
          {...getSwitchColors(palette)}
          accessibilityLabel={LL.clients.setDefaultAddress()}
        />
      </View>

      <View style={styles.formActions}>
        <Pressable
          style={[
            styles.button,
            styles.cancelButton,
            { backgroundColor: palette.buttonNeutralBackground },
          ]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={LL.common.cancel()}
        >
          <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
            {LL.common.cancel()}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.button, { backgroundColor: palette.tint }]}
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel={isEditMode ? LL.clients.updateAddress() : LL.clients.addAddress()}
        >
          <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
            {isEditMode ? LL.clients.updateAddress() : LL.clients.addAddress()}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    padding: 12,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  formContainerScreen: {
    width: '100%',
  },
  formTitle: {
    marginBottom: 12,
    fontSize: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  typeContainer: {
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonText: {
    fontSize: 14,
  },
  typeButtonTextActive: {
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  halfInput: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    marginBottom: 12,
  },
  switchLabel: {
    fontSize: 14,
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {},
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
