import { AddressForm } from '@/components/clients/address-form';
import { AddressFormData } from '@/components/clients/client-types';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import database from '@/db';
import { useI18nContext } from '@/i18n/i18n-react';
import ClientAddressModel from '@/model/ClientAddressModel';
import { updateAddress } from '@/repositories/address-repository';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

export default function EditAddressScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [formData, setFormData] = useState<AddressFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAddress = async () => {
      if (!id) return;

      try {
        const addressesCollection = database.get<ClientAddressModel>(ClientAddressModel.table);
        const address = await addressesCollection.find(id);

        const initialData = {
          type: address.type,
          street: address.street,
          street2: address.street2,
          city: address.city,
          postalCode: address.postalCode,
          country: address.country,
          isDefault: address.isDefault,
        };

        setFormData(initialData);
      } catch (error) {
        console.error('Error loading address:', error);
        Alert.alert(LL.common.error(), LL.clients.errorLoadAddress());
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    loadAddress();
  }, [id, LL.clients, LL.common, router]);

  const handleSubmit = async () => {
    if (!formData || !id) return;

    if (!formData.street.trim() || !formData.city.trim() || !formData.postalCode.trim()) {
      Alert.alert(LL.common.error(), LL.clients.errorRequiredFields());
      return;
    }

    try {
      await updateAddress({
        id,
        type: formData.type,
        street: formData.street,
        city: formData.city,
        postalCode: formData.postalCode,
        country: formData.country,
        isDefault: formData.isDefault,
      });
      router.back();
    } catch (error) {
      console.error('Error updating address:', error);
      Alert.alert(LL.common.error(), LL.clients.errorUpdateAddress());
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading || !formData) {
    return (
      <>
        <Stack.Screen
          options={{ title: LL.clients.editAddress(), headerBackTitle: LL.clients.title() }}
        />
        <ThemedView style={[styles.container, styles.loadingContainer]}>
          <ActivityIndicator size="large" />
        </ThemedView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: LL.clients.editAddress(), headerBackTitle: LL.clients.title() }}
      />
      <ThemedView style={styles.container}>
        <KeyboardAwareScroll contentContainerStyle={styles.content}>
          <AddressForm
            formData={formData}
            onFormDataChange={setFormData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditMode={true}
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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
