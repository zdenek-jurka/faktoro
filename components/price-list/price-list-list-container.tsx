import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { PriceListItemModel } from '@/model';
import { deletePriceListItem, getPriceListItems } from '@/repositories/price-list-repository';
import { useI18nContext } from '@/i18n/i18n-react';
import { useRouter } from 'expo-router';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { PriceListList } from './price-list-list';

type PriceListListContainerProps = {
  searchQuery: string;
  visibilityFilter: 'active' | 'all' | 'inactive';
  onItemPress: (id: string) => void;
};

export function PriceListListContainer({
  searchQuery,
  visibilityFilter,
  onItemPress,
}: PriceListListContainerProps) {
  const router = useRouter();
  const { LL } = useI18nContext();
  const [items, setItems] = useState<PriceListItemModel[]>([]);
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();

  useEffect(() => {
    const subscription = getPriceListItems(true).observe().subscribe(setItems);
    return () => subscription.unsubscribe();
  }, []);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visibilityItems =
      visibilityFilter === 'active'
        ? items.filter((item) => item.isActive)
        : visibilityFilter === 'inactive'
          ? items.filter((item) => !item.isActive)
          : items;

    if (!query) return visibilityItems;

    return visibilityItems.filter((item) => {
      return (
        item.name.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query)) ||
        item.unit.toLowerCase().includes(query) ||
        normalizeCurrencyCode(item.defaultPriceCurrency, defaultInvoiceCurrency)
          .toLowerCase()
          .includes(query)
      );
    });
  }, [defaultInvoiceCurrency, items, searchQuery, visibilityFilter]);

  const handleItemDelete = (id: string) => {
    Alert.alert(LL.priceList.deleteConfirm(), LL.priceList.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePriceListItem(id);
          } catch (error) {
            console.error('Error deleting price list item:', error);
            Alert.alert(LL.common.error(), LL.common.error());
          }
        },
      },
    ]);
  };

  return (
    <PriceListList
      items={filteredItems}
      fallbackCurrency={defaultInvoiceCurrency}
      searchQuery={searchQuery}
      onItemPress={onItemPress}
      onItemEdit={(id) => router.push(`/price-list/item/${id}/edit`)}
      onItemDelete={handleItemDelete}
      emptyState={
        <ActionEmptyState
          iconName={searchQuery.trim().length === 0 ? 'tag.fill' : 'magnifyingglass'}
          title={
            searchQuery.trim().length === 0 ? LL.priceList.emptyTitle() : LL.common.noResultsTitle()
          }
          description={
            searchQuery.trim().length === 0
              ? LL.priceList.emptyDescription()
              : LL.priceList.noItemsSearch()
          }
          actionLabel={searchQuery.trim().length === 0 ? LL.priceList.addNew() : undefined}
          onActionPress={
            searchQuery.trim().length === 0 ? () => router.push('/price-list/new') : undefined
          }
        />
      }
    />
  );
}
