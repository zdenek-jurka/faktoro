import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { Colors, withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { InvoiceModel } from '@/model';
import { getInvoiceStatusLabel } from '@/utils/invoice-status';
import { formatPriceValue } from '@/utils/price-utils';
import React from 'react';
import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

type InvoicesListProps = {
  invoices: InvoiceModel[];
  clientNameById: Map<string, string>;
  onInvoicePress: (id: string) => void;
  emptyState?: ReactNode;
};

export function InvoicesList({
  invoices,
  clientNameById,
  onInvoicePress,
  emptyState,
}: InvoicesListProps) {
  const colorScheme = useColorScheme();
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
          <SwipeableRow>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
                index === 0 && styles.rowFirst,
                isLast && styles.rowLast,
                pressed && styles.rowPressed,
              ]}
              onPress={() => onInvoicePress(item.id)}
              android_ripple={{ color: Colors[colorScheme ?? 'light'].border }}
              accessibilityRole="button"
              accessibilityLabel={item.invoiceNumber}
            >
              <View style={styles.rowMain}>
                <ThemedText type="defaultSemiBold">{item.invoiceNumber}</ThemedText>
                <ThemedText style={styles.metaText}>
                  {clientNameById.get(item.clientId) || '-'}
                </ThemedText>
                {statusLabel ? (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: withOpacity(
                          Colors[colorScheme ?? 'light'].destructive,
                          0.14,
                        ),
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.statusText,
                        {
                          color: Colors[colorScheme ?? 'light'].destructive,
                        },
                      ]}
                    >
                      {statusLabel}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowAside}>
                <ThemedText
                  style={[
                    styles.totalText,
                    { color: Colors[colorScheme ?? 'light'].timeHighlight },
                  ]}
                >
                  {formatPriceValue(item.total, intlLocale)}
                </ThemedText>
                <ThemedText style={styles.metaAsideText}>
                  {new Date(item.issuedAt).toLocaleDateString(intlLocale)} • {item.currency}
                </ThemedText>
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.divider,
                    {
                      backgroundColor: Colors[colorScheme ?? 'light'].border,
                    },
                  ]}
                />
              )}
            </Pressable>
          </SwipeableRow>
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
  row: { paddingHorizontal: 14, paddingVertical: 12, position: 'relative' },
  rowPressed: { opacity: 0.72 },
  rowFirst: { borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  rowLast: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  rowMain: { paddingRight: 110, gap: 2 },
  rowAside: {
    position: 'absolute',
    right: 14,
    top: 12,
    alignItems: 'flex-end',
    maxWidth: 120,
    gap: 2,
  },
  metaText: { fontSize: 12, opacity: 0.65 },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  metaAsideText: { fontSize: 12, opacity: 0.65, textAlign: 'right' },
  totalText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  divider: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64 },
  emptyText: { opacity: 0.6, fontSize: 15 },
});
