import { ClientListContainer } from '@/components/clients/clients-list-container';
import { ThemedView } from '@/components/themed-view';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { useHeaderSearch } from '@/hooks/use-header-search';
import database from '@/db';
import { useI18nContext } from '@/i18n/i18n-react';
import { isAndroid, isIos } from '@/utils/platform';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function ClientsScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();

  const handleClientPress = (id: string) => {
    router.push(`/clients/detail/${id}`);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.clients.title(),
          headerSearchBarOptions: getHeaderSearchBarOptions(LL.clients.searchPlaceholder()),
          headerRight: () => (
            <HeaderActions hidden={isAndroid && isSearchVisible}>
              <IconButton
                iconName="person.badge.plus"
                key="add"
                onPress={() =>
                  router.push({
                    pathname: '/clients/add',
                  })
                }
                accessibilityLabel={LL.clients.addNew()}
              />

              {isIos && (
                <IconButton
                  iconName="magnifyingglass"
                  key="search"
                  onPress={handleOpenSearch}
                  accessibilityLabel={LL.clients.searchPlaceholder()}
                />
              )}
            </HeaderActions>
          ),
        }}
      />
      <ClientListContainer
        database={database}
        searchQuery={searchQuery}
        onClientPress={handleClientPress}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
