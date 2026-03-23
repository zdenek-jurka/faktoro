import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { SwipeableList } from '@/components/ui/swipeable-list';
import { Colors, FontSizes, Opacity, Spacing } from '@/constants/theme';
import database from '@/db';
import { AddressType } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel } from '@/model';
import ClientAddressModel from '@/model/ClientAddressModel';
import { deleteAddress } from '@/repositories/address-repository';
import { Q } from '@nozbe/watermelondb';
import { useRouter } from 'expo-router';

interface ClientAddressSectionProps {
  client: ClientModel;
}

export function ClientAddressSection({ client }: ClientAddressSectionProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const [addresses, setAddresses] = useState<ClientAddressModel[]>([]);

  // Load client addresses
  useEffect(() => {
    const subscription = database
      .get<ClientAddressModel>(ClientAddressModel.table)
      .query(Q.where('client_id', client.id))
      .observe()
      .subscribe((newAddresses) => {
        const sortedAddresses = newAddresses.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        setAddresses(sortedAddresses);
      });

    return () => subscription.unsubscribe();
  }, [client.id]);

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

  const handleDeleteAddress = (addressId: string) => {
    Alert.alert(LL.clients.deleteAddress(), LL.clients.deleteAddressMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: () => deleteAddress(addressId),
      },
    ]);
  };

  return (
    <View style={styles.section}>
      <SwipeableList
        iconName="house.fill"
        title={LL.clients.addresses()}
        items={addresses}
        onAdd={() => router.push(`/clients/address/add?clientId=${client.id}`)}
        onDelete={(address: ClientAddressModel) => handleDeleteAddress(address.id)}
        onEdit={(address: ClientAddressModel) => router.push(`/clients/address/${address.id}`)}
        keyExtractor={(address: ClientAddressModel) => address.id}
        renderItem={(address: ClientAddressModel) => (
          <View style={styles.addressContent}>
            {address.isDefault && (
              <View style={[styles.defaultBadgeAbsolute, { backgroundColor: palette.success }]}>
                <ThemedText style={[styles.defaultBadgeText, { color: palette.onTint }]}>
                  {LL.clients.default()}
                </ThemedText>
              </View>
            )}
            <ThemedText style={styles.addressTypeLabel}>
              {getAddressTypeLabel(address.type)}
            </ThemedText>
            <ThemedText style={styles.addressLine}>{address.street}</ThemedText>
            {address.street2 && address.street2.trim() !== '' && (
              <ThemedText style={styles.addressLine}>{address.street2}</ThemedText>
            )}
            <ThemedText style={styles.addressLine}>
              {address.postalCode} {address.city}
            </ThemedText>
            <ThemedText style={styles.addressLine}>{address.country}</ThemedText>
          </View>
        )}
        emptyText={LL.clients.noAddresses()}
        itemBackgroundColor={Colors[colorScheme ?? 'light'].cardBackground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 0,
  },
  addressContent: {
    position: 'relative',
  },
  addressTypeLabel: {
    fontSize: FontSizes.xs,
    opacity: Opacity.muted,
    lineHeight: FontSizes.sm,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: FontSizes.base,
    lineHeight: FontSizes.xl,
  },
  defaultBadgeAbsolute: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
