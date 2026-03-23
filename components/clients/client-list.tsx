import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel, TimeEntryModel } from '@/model';
import { roundTimeByInterval } from '@/utils/time-utils';
import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { ClientListItem } from './client-list-item';

interface ClientListProps {
  clients: ClientModel[];
  runningEntries: TimeEntryModel[];
  localDeviceId: string | null;
  defaultBillingInterval?: number | null;
  searchQuery: string;
  onClientPress: (id: string) => void;
  headerComponent?: React.ReactElement;
  emptyState?: ReactNode;
}

export function ClientList({
  clients,
  runningEntries,
  localDeviceId,
  defaultBillingInterval,
  searchQuery,
  onClientPress,
  headerComponent,
  emptyState,
}: ClientListProps) {
  const colorScheme = useColorScheme();
  const { LL } = useI18nContext();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const runningEntriesByClientId = useMemo(() => {
    const map = new Map<string, TimeEntryModel>();
    runningEntries.forEach((entry) => {
      map.set(entry.clientId, entry);
    });
    return map;
  }, [runningEntries]);

  const orderedClients = useMemo(() => {
    if (clients.length === 0) return clients;

    const running: ClientModel[] = [];
    const rest: ClientModel[] = [];

    clients.forEach((client) => {
      if (runningEntriesByClientId.has(client.id)) {
        running.push(client);
      } else {
        rest.push(client);
      }
    });

    return [...running, ...rest];
  }, [clients, runningEntriesByClientId]);

  const getElapsedSeconds = (entry: TimeEntryModel) => {
    const totalElapsed = Math.floor((now - entry.startTime) / 1000);
    let pausedDuration = entry.totalPausedDuration || 0;
    if (entry.isPaused && entry.pausedAt) {
      const currentPauseDuration = Math.floor((now - entry.pausedAt) / 1000);
      pausedDuration += currentPauseDuration;
    }
    return Math.max(0, totalElapsed - pausedDuration);
  };

  return (
    <FlatList
      style={styles.listContainer}
      contentContainerStyle={[
        styles.listContent,
        orderedClients.length === 0 ? styles.listContentEmpty : null,
      ]}
      data={orderedClients}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets={true}
      ListHeaderComponent={headerComponent}
      ListEmptyComponent={
        <ThemedView style={styles.emptyState}>
          {emptyState ? (
            emptyState
          ) : (
            <>
              <IconSymbol name="person.3" size={48} color={Colors[colorScheme ?? 'light'].icon} />
              <ThemedText style={styles.emptyText}>
                {searchQuery.trim().length === 0
                  ? LL.clients.noClients()
                  : LL.clients.noClientsSearch()}
              </ThemedText>
            </>
          )}
        </ThemedView>
      }
      renderItem={({ item }) => {
        const runningEntry = runningEntriesByClientId.get(item.id);
        const runningTimer = runningEntry
          ? (() => {
              const elapsedSeconds = getElapsedSeconds(runningEntry);
              const roundedElapsedSeconds = roundTimeByInterval(
                elapsedSeconds,
                item,
                defaultBillingInterval,
              );

              return {
                elapsedSeconds,
                roundedElapsedSeconds,
                showRoundedTime: roundedElapsedSeconds !== elapsedSeconds,
                isPaused: runningEntry.isPaused,
                isRemote:
                  !!runningEntry.runningDeviceId &&
                  (!!localDeviceId ? runningEntry.runningDeviceId !== localDeviceId : true),
                deviceName:
                  runningEntry.runningDeviceName || runningEntry.runningDeviceId || undefined,
              };
            })()
          : undefined;

        return (
          <SwipeableRow>
            <ClientListItem client={item} onPress={onClientPress} runningTimer={runningTimer} />
          </SwipeableRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
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
