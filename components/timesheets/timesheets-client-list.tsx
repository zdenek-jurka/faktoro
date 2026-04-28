import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GroupedListRow } from '@/components/ui/grouped-list';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import React from 'react';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ClientTimesheetGroup } from './timesheets-clients-list-container';

type TimesheetsClientListProps = {
  clients: ClientTimesheetGroup[];
  searchQuery: string;
  onClientPress: (clientId: string) => void;
  emptyState?: ReactNode;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function TimesheetsClientList({
  clients,
  searchQuery,
  onClientPress,
  emptyState,
}: TimesheetsClientListProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const listContentStyle = useBottomSafeAreaStyle(styles.listContent);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={listContentStyle}
      data={clients}
      keyExtractor={(item) => item.client.id}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets={true}
      renderItem={({ item, index }) => {
        const isLast = index === clients.length - 1;

        return (
          <GroupedListRow
            isFirst={index === 0}
            isLast={isLast}
            onPress={() => onClientPress(item.client.id)}
            accessibilityLabel={item.client.name}
            showChevron
            style={isLast && styles.rowLastSpacing}
            trailing={
              <View style={styles.rowTrailingContent}>
                <View style={[styles.timeBadge, { backgroundColor: palette.timeHighlight }]}>
                  <ThemedText style={[styles.timeBadgeText, { color: palette.onHighlight }]}>
                    {formatDuration(item.remainingDuration)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.timeBadgeLabel} numberOfLines={1}>
                  {LL.timesheets.remainingToInvoiceLabel()}
                </ThemedText>
              </View>
            }
          >
            <View style={styles.rowNameWrap}>
              <ThemedText type="defaultSemiBold" style={styles.rowName} numberOfLines={1}>
                {item.client.name}
              </ThemedText>
              {item.client.isCompany && (
                <ThemedView
                  style={[
                    styles.companyBadge,
                    {
                      backgroundColor: palette.cardBackground,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <ThemedText
                    style={[styles.companyBadgeText, { color: palette.tint }]}
                    numberOfLines={1}
                  >
                    {LL.clients.company()}
                  </ThemedText>
                </ThemedView>
              )}
            </View>
            {!!item.client.companyId && (
              <ThemedText style={styles.metaText} numberOfLines={1}>
                {LL.clients.companyIdLabel()} {item.client.companyId}
              </ThemedText>
            )}
            <ThemedText style={styles.metaText} numberOfLines={1}>
              {LL.timesheets.countLabel({ count: item.timesheetCount })} •{' '}
              {LL.timesheets.entriesCount({ count: item.entriesCount })}
            </ThemedText>
          </GroupedListRow>
        );
      }}
      ListEmptyComponent={
        <ThemedView style={styles.emptyState}>
          {emptyState || (
            <ThemedText style={styles.emptyText}>
              {searchQuery.trim().length === 0
                ? LL.timesheets.noClients()
                : LL.timesheets.noClientsSearch()}
            </ThemedText>
          )}
        </ThemedView>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  rowLastSpacing: {
    marginBottom: 12,
  },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowName: {
    fontSize: 17,
  },
  companyBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  companyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 12,
    opacity: 0.65,
  },
  rowTrailingContent: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 0,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeBadgeLabel: {
    fontSize: 10,
    opacity: 0.65,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    opacity: 0.6,
    fontSize: 15,
  },
});
