import { PriceListItem } from '@/components/price-list/price-list-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DismissibleSwipeHint } from '@/components/ui/dismissible-swipe-hint';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { PriceListItemModel } from '@/model';
import React from 'react';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';

type PriceListListProps = {
  items: PriceListItemModel[];
  fallbackCurrency: string;
  searchQuery: string;
  onItemPress: (id: string) => void;
  onItemEdit: (id: string) => void;
  onItemDelete: (id: string) => void;
  emptyState?: ReactNode;
};

export function PriceListList({
  items,
  fallbackCurrency,
  searchQuery,
  onItemPress,
  onItemEdit,
  onItemDelete,
  emptyState,
}: PriceListListProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <DismissibleSwipeHint hintKey="price-list.items" visible={items.length > 0} />
      }
      renderItem={({ item }) => (
        <ThemedView style={styles.itemWrap}>
          <SwipeableRow onEdit={() => onItemEdit(item.id)} onDelete={() => onItemDelete(item.id)}>
            <PriceListItem item={item} fallbackCurrency={fallbackCurrency} onPress={onItemPress} />
          </SwipeableRow>
        </ThemedView>
      )}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets={true}
      contentContainerStyle={[
        styles.listContent,
        items.length === 0 ? styles.listContentEmpty : null,
      ]}
      ListEmptyComponent={
        <ThemedView style={styles.emptyState}>
          {emptyState ? (
            emptyState
          ) : (
            <>
              <IconSymbol name="tag" size={48} color={palette.icon} />
              <ThemedText style={styles.emptyText}>
                {searchQuery.trim().length === 0
                  ? LL.priceList.noItems()
                  : LL.priceList.noItemsSearch()}
              </ThemedText>
            </>
          )}
        </ThemedView>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  itemWrap: {
    marginHorizontal: -16,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 16,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.6,
  },
});
