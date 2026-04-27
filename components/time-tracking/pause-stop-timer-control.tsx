import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BorderRadius, FontSizes, Opacity, Shadows, Spacing, withOpacity } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel, TimeEntryModel } from '@/model';
import { roundTimeByInterval } from '@/utils/time-utils';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

type PauseStopTimerControlProps = {
  entry: Pick<TimeEntryModel, 'startTime' | 'isPaused' | 'pausedAt' | 'totalPausedDuration'>;
  client?: ClientModel;
  defaultBillingInterval?: number;
  onPauseResume: () => void;
  onStop: () => void;
  maxWidth?: number;
  title?: string;
  detail?: string;
  statusLabel?: string;
};

export function PauseStopTimerControl({
  entry,
  client,
  defaultBillingInterval,
  onPauseResume,
  onStop,
  maxWidth,
  title,
  detail,
  statusLabel,
}: PauseStopTimerControlProps) {
  const colorScheme = useColorScheme();
  const palette = usePalette();
  const { LL } = useI18nContext();
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const getElapsed = () => {
      const totalElapsed = Math.floor((Date.now() - entry.startTime) / 1000);
      let pausedDuration = entry.totalPausedDuration || 0;

      if (entry.isPaused && entry.pausedAt) {
        const currentPauseDuration = Math.floor((Date.now() - entry.pausedAt) / 1000);
        pausedDuration += currentPauseDuration;
      }

      return Math.max(0, totalElapsed - pausedDuration);
    };

    setElapsedTime(getElapsed());
    interval = setInterval(() => {
      setElapsedTime(getElapsed());
    }, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [entry.isPaused, entry.pausedAt, entry.startTime, entry.totalPausedDuration]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const roundedElapsedTime = roundTimeByInterval(elapsedTime, client, defaultBillingInterval);
  const showRounded = roundedElapsedTime !== elapsedTime;
  const accentColor = entry.isPaused ? palette.timerPause : palette.timeHighlight;
  const foregroundAccentColor = entry.isPaused && colorScheme !== 'dark' ? '#B35F00' : accentColor;
  const currentStatusLabel =
    statusLabel ?? (entry.isPaused ? LL.timeTracking.paused() : LL.timeTracking.running());

  return (
    <View
      style={[
        styles.container,
        maxWidth ? { maxWidth } : null,
        {
          backgroundColor: palette.cardBackground,
          borderColor: palette.border,
          ...(Platform.OS === 'ios' ? Shadows.sm : {}),
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />

      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: withOpacity(accentColor, 0.16) }]}>
          <IconSymbol
            name={entry.isPaused ? 'pause.fill' : 'clock.fill'}
            size={18}
            color={foregroundAccentColor}
          />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <ThemedText
              style={[styles.statusLabel, { color: foregroundAccentColor }]}
              numberOfLines={1}
            >
              {currentStatusLabel}
            </ThemedText>
            {title ? (
              <>
                <ThemedText style={[styles.titleSeparator, { color: palette.textSecondary }]}>
                  ·
                </ThemedText>
                <ThemedText style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                  {title}
                </ThemedText>
              </>
            ) : null}
          </View>
          {detail ? (
            <ThemedText style={[styles.detail, { color: palette.textSecondary }]} numberOfLines={1}>
              {detail}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.timeSection}>
        <View style={styles.timeBlock}>
          <ThemedText style={[styles.timeLabel, { color: palette.textSecondary }]}>
            {LL.timeTracking.actualTime()}
          </ThemedText>
          <ThemedText style={[styles.timeValue, { color: palette.text }]}>
            {formatTime(elapsedTime)}
          </ThemedText>
        </View>

        {showRounded && (
          <View style={[styles.timeBlock, styles.timeBlockRight]}>
            <ThemedText style={[styles.billableLabel, { color: palette.textSecondary }]}>
              {LL.timeTracking.billableTime()}
            </ThemedText>
            <ThemedText style={[styles.timeValue, { color: palette.timeHighlight }]}>
              {formatTime(roundedElapsedTime)}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.buttonsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: withOpacity(accentColor, 0.13),
              opacity: pressed ? Opacity.strong : 1,
            },
          ]}
          onPress={onPauseResume}
          android_ripple={{ color: withOpacity(foregroundAccentColor, 0.18), borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={entry.isPaused ? LL.timeTracking.resume() : LL.timeTracking.pause()}
        >
          <IconSymbol
            name={entry.isPaused ? 'play.fill' : 'pause.fill'}
            size={16}
            color={foregroundAccentColor}
          />
          <ThemedText style={[styles.buttonLabel, { color: foregroundAccentColor }]}>
            {entry.isPaused ? LL.timeTracking.resume() : LL.timeTracking.pause()}
          </ThemedText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: palette.timerStop,
              opacity: pressed ? Opacity.strong : 1,
            },
          ]}
          onPress={onStop}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={LL.timeTracking.stop()}
        >
          <IconSymbol name="stop.fill" size={16} color={palette.onDestructive} />
          <ThemedText style={[styles.buttonLabel, { color: palette.onDestructive }]}>
            {LL.timeTracking.stop()}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  titleSeparator: {
    fontSize: FontSizes.sm,
    opacity: 0.65,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
  },
  timeSection: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'flex-end',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  timeBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timeBlockRight: {
    alignItems: 'flex-end',
  },
  sectionDivider: {
    height: 1,
  },
  timeLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  timeValue: {
    fontSize: FontSizes['2xl'],
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  billableLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  buttonsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  buttonLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
