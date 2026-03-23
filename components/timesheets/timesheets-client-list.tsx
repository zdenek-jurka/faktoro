import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import React from 'react';
import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
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
  const colorScheme = useColorScheme();
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
          <SwipeableRow>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
                index === 0 && styles.rowFirst,
                isLast && styles.rowLast,
                pressed && styles.rowPressed,
              ]}
              onPress={() => onClientPress(item.client.id)}
              android_ripple={{ color: Colors[colorScheme ?? 'light'].border }}
              accessibilityRole="button"
              accessibilityLabel={item.client.name}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowNameWrap}>
                  <ThemedText type="defaultSemiBold" style={styles.rowName}>
                    {item.client.name}
                  </ThemedText>
                  {item.client.isCompany && (
                    <ThemedView
                      style={[
                        styles.companyBadge,
                        {
                          backgroundColor: Colors[colorScheme ?? 'light'].cardBackground,
                          borderColor: Colors[colorScheme ?? 'light'].border,
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.companyBadgeText,
                          { color: Colors[colorScheme ?? 'light'].tint },
                        ]}
                      >
                        {LL.clients.company()}
                      </ThemedText>
                    </ThemedView>
                  )}
                </View>
                {!!item.client.companyId && (
                  <ThemedText style={styles.metaText}>
                    {LL.clients.companyIdLabel()} {item.client.companyId}
                  </ThemedText>
                )}
                <ThemedText style={styles.metaText}>
                  {LL.timesheets.countLabel({ count: item.timesheetCount })} •{' '}
                  {LL.timesheets.entriesCount({ count: item.entriesCount })}
                </ThemedText>
              </View>

              <View style={styles.rowRight}>
                <View
                  style={[
                    styles.timeBadge,
                    { backgroundColor: Colors[colorScheme ?? 'light'].timeHighlight },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.timeBadgeText,
                      { color: Colors[colorScheme ?? 'light'].onHighlight },
                    ]}
                  >
                    {formatDuration(item.remainingDuration)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.timeBadgeLabel}>
                  {LL.timesheets.remainingToInvoiceLabel()}
                </ThemedText>
                <IconSymbol
                  name="chevron.right"
                  size={20}
                  color={Colors[colorScheme ?? 'light'].icon}
                />
              </View>

              {!isLast && (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: Colors[colorScheme ?? 'light'].border },
                  ]}
                />
              )}
            </Pressable>
          </SwipeableRow>
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
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowFirst: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  rowLast: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginBottom: 12,
  },
  rowMain: {
    flex: 1,
    gap: 2,
    paddingRight: 96,
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
  rowRight: {
    position: 'absolute',
    right: 14,
    top: 14,
    alignItems: 'flex-end',
    gap: 4,
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
  divider: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
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
