import { PriceListListContainer } from '@/components/price-list';
import { ThemedView } from '@/components/themed-view';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { useHeaderSearch } from '@/hooks/use-header-search';
import { useI18nContext } from '@/i18n/i18n-react';
import { isAndroid, isIos } from '@/utils/platform';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function PriceListScreen() {
  const router = useRouter();
  const { LL } = useI18nContext();
  const [visibilityFilter, setVisibilityFilter] = useState<'active' | 'all' | 'inactive'>('active');
  const { getHeaderSearchBarOptions, handleOpenSearch, isSearchVisible, searchQuery } =
    useHeaderSearch();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.priceList.title(),
          headerSearchBarOptions: getHeaderSearchBarOptions(LL.priceList.searchPlaceholder()),
          headerRight: () => (
            <HeaderActions hidden={isAndroid && isSearchVisible}>
              <IconButton
                iconName="plus"
                onPress={() => router.push('/price-list/new')}
                accessibilityLabel={LL.priceList.addNew()}
              />
              {isIos && (
                <IconButton
                  iconName="magnifyingglass"
                  onPress={handleOpenSearch}
                  accessibilityLabel={LL.priceList.searchPlaceholder()}
                />
              )}
            </HeaderActions>
          ),
        }}
      />

      <View style={styles.filterWrap}>
        <SegmentedControl
          values={[
            LL.priceList.filterActive(),
            LL.priceList.filterAll(),
            LL.priceList.filterInactive(),
          ]}
          selectedIndex={visibilityFilter === 'active' ? 0 : visibilityFilter === 'all' ? 1 : 2}
          onChange={(event) => {
            const next =
              event.nativeEvent.selectedSegmentIndex === 0
                ? 'active'
                : event.nativeEvent.selectedSegmentIndex === 1
                  ? 'all'
                  : 'inactive';
            setVisibilityFilter(next);
          }}
        />
      </View>
      <PriceListListContainer
        searchQuery={searchQuery}
        visibilityFilter={visibilityFilter}
        onItemPress={(id) => router.push(`/price-list/item/${id}`)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
