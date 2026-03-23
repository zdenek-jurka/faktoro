import { InvoicesListContainer } from '@/components/invoices';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import database from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel } from '@/model';
import { isAndroid } from '@/utils/platform';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export default function ClientInvoicesScreen() {
  const router = useRouter();
  const { id, backToClientId } = useLocalSearchParams<{ id: string; backToClientId?: string }>();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { LL } = useI18nContext();

  const [client, setClient] = useState<ClientModel | null>(null);

  useEffect(() => {
    if (!id) return;
    const subscription = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(id)
      .subscribe(setClient);
    return () => subscription.unsubscribe();
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: client?.name?.trim() || LL.invoices.title(),
          headerLeft: backToClientId
            ? () => (
                <Pressable
                  hitSlop={8}
                  onPress={() => router.navigate(`/clients/detail/${backToClientId}`)}
                  style={styles.headerBackButton}
                >
                  <IconSymbol name="chevron.left" size={18} color={palette.tint} />
                  {!isAndroid && (
                    <Text
                      style={[styles.headerBackLabel, { color: palette.tint }]}
                      numberOfLines={1}
                    >
                      {client?.name ?? LL.tabs.clients()}
                    </Text>
                  )}
                </Pressable>
              )
            : undefined,
        }}
      />

      <InvoicesListContainer
        clientId={id}
        searchQuery=""
        onInvoicePress={(invoiceId) => router.push(`/invoices/${invoiceId}`)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 160,
  },
  headerBackLabel: {
    fontSize: 17,
  },
});
