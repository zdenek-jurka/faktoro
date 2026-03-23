import { InvoicesListContainer } from '@/components/invoices';
import { ThemedView } from '@/components/themed-view';
import { useI18nContext } from '@/i18n/i18n-react';
import database from '@/db';
import { ClientModel } from '@/model';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

export default function ClientInvoicesInClientsTab() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { LL } = useI18nContext();
  const [client, setClient] = useState<ClientModel | null>(null);

  useEffect(() => {
    if (!id) return;
    const sub = database
      .get<ClientModel>(ClientModel.table)
      .findAndObserve(id)
      .subscribe(setClient);
    return () => sub.unsubscribe();
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: client?.name?.trim()
            ? `${client.name.trim()} – ${LL.invoices.title()}`
            : LL.invoices.title(),
        }}
      />
      <InvoicesListContainer
        clientId={id}
        searchQuery=""
        onInvoicePress={(invoiceId) => router.push(`/clients/invoices/detail/${invoiceId}`)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
