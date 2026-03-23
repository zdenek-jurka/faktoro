import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Colors, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel, TimeEntryModel } from '@/model';
import { hasEffectiveBillingInterval, roundTimeByInterval } from '@/utils/time-utils';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type ClientTimeGroupProps = {
  client: ClientModel;
  entries: TimeEntryModel[];
  defaultBillingInterval?: number;
  formatTime: (seconds: number) => string;
  onPress: (clientId: string) => void;
};

export function ClientTimeGroup({
  client,
  entries,
  defaultBillingInterval,
  formatTime,
  onPress,
}: ClientTimeGroupProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const [nowMs, setNowMs] = useState(Date.now());
  const hasRunningEntry = entries.some((entry) => entry.isRunning);

  useEffect(() => {
    if (!hasRunningEntry) return;

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasRunningEntry]);

  const totalTime = entries.reduce(
    (sum, entry) => sum + getDisplayedTimeEntryDuration(entry, nowMs),
    0,
  );
  const usesBillingInterval = hasEffectiveBillingInterval(client, defaultBillingInterval);
  const billableTime = usesBillingInterval
    ? entries.reduce(
        (sum, entry) =>
          sum +
          roundTimeByInterval(
            getDisplayedTimeEntryDuration(entry, nowMs),
            client,
            defaultBillingInterval,
          ),
        0,
      )
    : totalTime;

  return (
    <Pressable
      onPress={() => onPress(client.id)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: palette.cardBackground },
        pressed && styles.containerPressed,
      ]}
    >
      <View style={styles.content}>
        <InitialsAvatar name={client.name} size={40} fontSize={FontSizes.md} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <ThemedText type="defaultSemiBold" style={styles.name}>
              {client.name}
            </ThemedText>
            {client.isCompany && (
              <ThemedView style={[styles.badge, { backgroundColor: palette.infoBadgeBackground }]}>
                <ThemedText style={[styles.badgeText, { color: palette.infoBadgeText }]}>
                  {LL.clients.company()}
                </ThemedText>
              </ThemedView>
            )}
          </View>
          {client.companyId && (
            <ThemedText style={styles.companyId} numberOfLines={1}>
              {LL.clients.companyIdLabel()} {client.companyId}
            </ThemedText>
          )}
          <ThemedText style={styles.entryCount}>
            {entries.length}{' '}
            {entries.length === 1 ? LL.timeTracking.entry() : LL.timeTracking.entries()}
          </ThemedText>
        </View>

        <View style={styles.trailing}>
          <View style={[styles.timerBadge, { backgroundColor: palette.timeHighlight }]}>
            <ThemedText style={[styles.timerBadgeText, { color: palette.onHighlight }]}>
              {formatTime(billableTime)}
            </ThemedText>
          </View>
          {usesBillingInterval && billableTime !== totalTime && (
            <ThemedText style={styles.actualTime}>{formatTime(totalTime)}</ThemedText>
          )}
          <IconSymbol name="chevron.right" size={20} color={palette.icon} />
        </View>
      </View>
      <View
        style={[
          styles.divider,
          {
            borderBottomColor: palette.border,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  containerPressed: {
    opacity: 0.72,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divider: {
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 17,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  companyId: {
    fontSize: 14,
    opacity: 0.6,
  },
  entryCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
  },
  timerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  actualTime: {
    fontSize: 11,
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
});
