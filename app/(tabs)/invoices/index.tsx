import { InvoicesListContainer } from '@/components/invoices';
import { ThemedView } from '@/components/themed-view';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { useHeaderSearch } from '@/hooks/use-header-search';
import { useI18nContext } from '@/i18n/i18n-react';
import { isAndroid, isIos } from '@/utils/platform';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function InvoicesScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.invoices.title(),
          headerSearchBarOptions: getHeaderSearchBarOptions(LL.invoices.searchPlaceholder()),
          headerRight: () => (
            <HeaderActions hidden={isAndroid && isSearchVisible}>
              <IconButton
                iconName="plus"
                onPress={() => router.push('/invoices/new')}
                accessibilityLabel={LL.invoices.draftTitle()}
              />
              {isIos && (
                <IconButton
                  iconName="magnifyingglass"
                  onPress={handleOpenSearch}
                  accessibilityLabel={LL.invoices.searchPlaceholder()}
                />
              )}
            </HeaderActions>
          ),
        }}
      />

      <InvoicesListContainer
        searchQuery={searchQuery}
        onInvoicePress={(id) => router.push(`/invoices/${id}`)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
