import database from '@/db';
import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { PriceListItemModel } from '@/model';
import { deletePriceListItem, getPriceListItems } from '@/repositories/price-list-repository';
import { escapeLike } from '@/utils/escape-like';
import { useI18nContext } from '@/i18n/i18n-react';
import { Q } from '@nozbe/watermelondb';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { PriceListList } from './price-list-list';

type PriceListListContainerProps = {
  searchQuery: string;
  visibilityFilter: 'active' | 'all' | 'inactive';
  onItemPress: (id: string) => void;
};

function buildPriceListItemsQuery(
  searchQuery: string,
  visibilityFilter: PriceListListContainerProps['visibilityFilter'],
) {
  const collection = database.get<PriceListItemModel>(PriceListItemModel.table);
  const query = searchQuery.trim();
  const searchClause = query
    ? Q.or(
        Q.where('name', Q.like(`%${escapeLike(query)}%`)),
        Q.where('description', Q.like(`%${escapeLike(query)}%`)),
        Q.where('unit', Q.like(`%${escapeLike(query)}%`)),
        Q.where('default_price_currency', Q.like(`%${escapeLike(query)}%`)),
      )
    : null;

  if (visibilityFilter === 'active') {
    return searchClause
      ? collection.query(Q.where('is_active', true), searchClause, Q.sortBy('name', Q.asc))
      : getPriceListItems(false);
  }

  if (visibilityFilter === 'inactive') {
    return searchClause
      ? collection.query(Q.where('is_active', false), searchClause, Q.sortBy('name', Q.asc))
      : collection.query(Q.where('is_active', false), Q.sortBy('name', Q.asc));
  }

  return searchClause
    ? collection.query(searchClause, Q.sortBy('name', Q.asc))
    : getPriceListItems(true);
}

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
    const subscription = buildPriceListItemsQuery(searchQuery, visibilityFilter)
      .observeWithColumns([
        'name',
        'description',
        'unit',
        'default_price',
        'default_price_currency',
        'is_active',
      ])
      .subscribe(setItems);
    return () => subscription.unsubscribe();
  }, [searchQuery, visibilityFilter]);

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
      items={items}
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
