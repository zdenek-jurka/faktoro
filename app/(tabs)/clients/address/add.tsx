import { AddressForm } from '@/components/clients/address-form';
import { AddressFormData } from '@/components/clients/client-types';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import database from '@/db';
import { AddressType } from '@/db/schema';
import { useI18nContext } from '@/i18n/i18n-react';
import ClientAddressModel from '@/model/ClientAddressModel';
import { createAddress } from '@/repositories/address-repository';
import { Q } from '@nozbe/watermelondb';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

const initialAddressFormData: AddressFormData = {
  type: AddressType.BILLING,
  street: '',
  street2: '',
  city: '',
  postalCode: '',
  country: '',
  isDefault: false,
};

export default function AddAddressScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const [formData, setFormData] = useState<AddressFormData>(initialAddressFormData);

  useEffect(() => {
    const preloadDefaultFlagForFirstAddress = async () => {
      if (!clientId) return;

      const addressesCollection = database.get<ClientAddressModel>(ClientAddressModel.table);
      const existingAddressCount = await addressesCollection
        .query(Q.where('client_id', clientId))
        .fetchCount();

      const isFirstAddress = existingAddressCount === 0;
      if (!isFirstAddress) return;

      setFormData((prev) => {
        const isStillUntouched =
          prev.type === AddressType.BILLING &&
          !prev.isDefault &&
          prev.street === '' &&
          prev.street2 === '' &&
          prev.city === '' &&
          prev.postalCode === '' &&
          prev.country === '';

        if (!isStillUntouched) return prev;
        return { ...prev, isDefault: true };
      });
    };

    preloadDefaultFlagForFirstAddress().catch((error) => {
      console.error('Error preloading default address flag:', error);
    });
  }, [clientId]);

  const handleSubmit = async () => {
    if (!formData.street.trim() || !formData.city.trim() || !formData.postalCode.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorRequiredFields());
      return;
    }

    if (!clientId) {
      Alert.alert(LL.common.error(), LL.clients.errorMissingClientId());
      return;
    }

    try {
      await createAddress({
        clientId,
        type: formData.type,
        street: formData.street,
        city: formData.city,
        postalCode: formData.postalCode,
        country: formData.country,
        isDefault: formData.isDefault,
      });
      router.back();
    } catch (error) {
      console.error('Error creating address:', error);
      Alert.alert(LL.common.error(), LL.clients.errorCreateAddress());
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{ title: LL.clients.addAddress(), headerBackTitle: LL.clients.title() }}
      />
      <ThemedView style={styles.container}>
        <KeyboardAwareScroll contentContainerStyle={styles.content}>
          <AddressForm
            formData={formData}
            onFormDataChange={setFormData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditMode={false}
            isScreen={true}
          />
        </KeyboardAwareScroll>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
});
