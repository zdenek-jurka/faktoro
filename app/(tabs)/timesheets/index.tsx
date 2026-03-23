import { TimesheetsClientsListContainer } from '@/components/timesheets';
import { ThemedView } from '@/components/themed-view';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { useHeaderSearch } from '@/hooks/use-header-search';
import { useI18nContext } from '@/i18n/i18n-react';
import { isAndroid, isIos } from '@/utils/platform';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function TimesheetsClientsScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.timesheets.title(),
          headerSearchBarOptions: getHeaderSearchBarOptions(LL.timesheets.searchPlaceholder()),
          headerRight: () => (
            <HeaderActions hidden={isAndroid && isSearchVisible}>
              {isIos && (
                <IconButton
                  iconName="magnifyingglass"
                  onPress={handleOpenSearch}
                  accessibilityLabel={LL.timesheets.searchPlaceholder()}
                />
              )}
            </HeaderActions>
          ),
        }}
      />

      <TimesheetsClientsListContainer
        searchQuery={searchQuery}
        onClientPress={(clientId) => router.push(`/timesheets/client/${clientId}`)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
