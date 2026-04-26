import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BorderRadius, FontSizes, Opacity, Shadows, Spacing } from '@/constants/theme';
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
};

export function PauseStopTimerControl({
  entry,
  client,
  defaultBillingInterval,
  onPauseResume,
  onStop,
  maxWidth,
}: PauseStopTimerControlProps) {
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
      {/* Time section */}
      <View style={styles.timeSection}>
        <View style={styles.timeBlock}>
          <ThemedText style={styles.timeLabel}>{LL.timeTracking.actualTime()}</ThemedText>
          <ThemedText style={styles.timeValue}>{formatTime(elapsedTime)}</ThemedText>
        </View>

        {showRounded && (
          <>
            <View style={[styles.timeDivider, { backgroundColor: palette.border }]} />
            <View style={[styles.timeBlock, styles.timeBlockRight]}>
              <ThemedText style={styles.timeLabel}>{LL.timeTracking.billableTime()}</ThemedText>
              <ThemedText style={[styles.timeValue, { color: palette.timeHighlight }]}>
                {formatTime(roundedElapsedTime)}
              </ThemedText>
            </View>
          </>
        )}
      </View>

      {/* Divider */}
      <View style={[styles.sectionDivider, { backgroundColor: palette.border }]} />

      {/* Buttons */}
      <View style={styles.buttonsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: entry.isPaused ? palette.timeHighlight : palette.timerPause,
              opacity: pressed ? Opacity.strong : 1,
            },
          ]}
          onPress={onPauseResume}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={entry.isPaused ? LL.timeTracking.resume() : LL.timeTracking.pause()}
        >
          <IconSymbol
            name={entry.isPaused ? 'play.fill' : 'pause.fill'}
            size={16}
            color={palette.onHighlight}
          />
          <ThemedText style={[styles.buttonLabel, { color: palette.onHighlight }]}>
            {entry.isPaused ? LL.timeTracking.resume() : LL.timeTracking.pause()}
          </ThemedText>
        </Pressable>

        <View style={[styles.buttonDivider, { backgroundColor: palette.border }]} />

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
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  timeSection: {
    flexDirection: 'row',
    width: '100%',
  },
  timeBlock: {
    flex: 1,
    flexBasis: 0,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    gap: 1,
  },
  timeBlockRight: {
    alignItems: 'flex-end',
  },
  timeDivider: {
    width: 1,
    marginVertical: Spacing.sm,
  },
  sectionDivider: {
    height: 1,
  },
  timeLabel: {
    fontSize: FontSizes.xs,
    opacity: Opacity.subtle,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  timeValue: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  buttonsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  buttonDivider: {
    width: 1,
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
