import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Colors, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel } from '@/model';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface ClientListItemProps {
  client: ClientModel;
  onPress: (id: string) => void;
  runningTimer?: {
    elapsedSeconds: number;
    roundedElapsedSeconds: number;
    showRoundedTime: boolean;
    isPaused: boolean;
    isRemote?: boolean;
    deviceName?: string;
  };
}

export function ClientListItem({ client, onPress, runningTimer }: ClientListItemProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Pressable
      onPress={() => onPress(client.id)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: palette.cardBackground },
        pressed && styles.containerPressed,
      ]}
      android_ripple={{ color: palette.border }}
      accessibilityRole="button"
      accessibilityLabel={client.name}
    >
      <View style={styles.content}>
        <InitialsAvatar name={client.name} size={40} fontSize={FontSizes.md} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <ThemedText type="defaultSemiBold" style={styles.name}>
              {client.name}
            </ThemedText>
            {client.isCompany && (
              <ThemedView
                style={[
                  styles.badge,
                  {
                    backgroundColor: palette.infoBadgeBackground,
                  },
                ]}
              >
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
        </View>
        <View style={styles.trailing}>
          {runningTimer && (
            <View style={styles.timerWrap}>
              <View
                style={[
                  styles.timerBadge,
                  {
                    backgroundColor: runningTimer.isPaused
                      ? palette.timerPause
                      : palette.timeHighlight,
                  },
                ]}
              >
                <ThemedText style={[styles.timerBadgeText, { color: palette.onHighlight }]}>
                  {formatTime(runningTimer.roundedElapsedSeconds)}
                </ThemedText>
              </View>
              {runningTimer.showRoundedTime && (
                <ThemedText style={styles.actualTimeText}>
                  {formatTime(runningTimer.elapsedSeconds)}
                </ThemedText>
              )}
              {runningTimer.isRemote && runningTimer.deviceName && (
                <ThemedText style={styles.remoteDeviceText} numberOfLines={1}>
                  {LL.timeTracking.runningOnOtherDevice({ device: runningTimer.deviceName })}
                </ThemedText>
              )}
            </View>
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
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerWrap: {
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: 180,
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
  remoteDeviceText: {
    fontSize: 10,
    opacity: 0.7,
    textAlign: 'right',
  },
  actualTimeText: {
    fontSize: 11,
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
});
