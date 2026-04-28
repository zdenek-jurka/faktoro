import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GroupedListRow } from '@/components/ui/grouped-list';
import { withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { InvoiceModel } from '@/model';
import { getInvoiceStatusLabel } from '@/utils/invoice-status';
import { formatPriceValue } from '@/utils/price-utils';
import React from 'react';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

type InvoicesListProps = {
  invoices: InvoiceModel[];
  clientNameById: Map<string, string>;
  invoiceBuyerNameById: Map<string, string>;
  onInvoicePress: (id: string) => void;
  emptyState?: ReactNode;
};

export function InvoicesList({
  invoices,
  clientNameById,
  invoiceBuyerNameById,
  onInvoicePress,
  emptyState,
}: InvoicesListProps) {
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={listContentStyle}
      data={invoices}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets={true}
      renderItem={({ item, index }) => {
        const isLast = index === invoices.length - 1;
        const statusLabel = getInvoiceStatusLabel(item, LL);
        return (
          <GroupedListRow
            isFirst={index === 0}
            isLast={isLast}
            onPress={() => onInvoicePress(item.id)}
            accessibilityLabel={item.invoiceNumber}
            showChevron
            trailing={
              <View style={styles.rowTrailingContent}>
                <View
                  style={[
                    styles.totalBadge,
                    {
                      backgroundColor: palette.timeHighlight,
                    },
                  ]}
                >
                  <ThemedText
                    style={[styles.totalText, { color: palette.onHighlight }]}
                    numberOfLines={1}
                  >
                    {formatPriceValue(item.total, intlLocale)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.metaAsideText} numberOfLines={1}>
                  {new Date(item.issuedAt).toLocaleDateString(intlLocale)} • {item.currency}
                </ThemedText>
              </View>
            }
          >
            <View style={styles.titleRow}>
              <ThemedText type="defaultSemiBold" style={styles.invoiceNumber} numberOfLines={1}>
                {item.invoiceNumber}
              </ThemedText>
              {statusLabel ? (
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: withOpacity(palette.destructive, 0.14),
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.statusText,
                      {
                        color: palette.destructive,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {statusLabel}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={styles.metaText} numberOfLines={1}>
              {clientNameById.get(item.clientId) || invoiceBuyerNameById.get(item.id) || '-'}
            </ThemedText>
          </GroupedListRow>
        );
      }}
      ListEmptyComponent={
        <ThemedView style={styles.emptyState}>
          {emptyState || <ThemedText style={styles.emptyText}>{LL.invoices.empty()}</ThemedText>}
        </ThemedView>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  rowTrailingContent: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  invoiceNumber: {
    flexShrink: 1,
    minWidth: 0,
  },
  metaText: { fontSize: 12, opacity: 0.65 },
  statusBadge: {
    flexShrink: 0,
    maxWidth: '48%',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  metaAsideText: { fontSize: 12, opacity: 0.65, textAlign: 'right' },
  totalBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  totalText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { opacity: 0.6, fontSize: 15 },
});
