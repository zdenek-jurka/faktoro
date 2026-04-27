import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { withOpacity } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type Props = {
  label: string;
  duration: string;
  title?: string;
  detail?: string;
  style?: StyleProp<ViewStyle>;
};

export function RemoteRunningTimerStatus({ label, duration, title, detail, style }: Props) {
  const palette = usePalette();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: withOpacity(palette.timeHighlight, 0.08),
          borderColor: withOpacity(palette.timeHighlight, 0.22),
        },
        style,
      ]}
    >
      <View style={[styles.accent, { backgroundColor: palette.timeHighlight }]} />
      <View
        style={[styles.iconWrap, { backgroundColor: withOpacity(palette.timeHighlight, 0.14) }]}
      >
        <IconSymbol name="network" size={18} color={palette.timeHighlight} />
      </View>
      <View style={styles.textBlock}>
        {title ? (
          <ThemedText style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </ThemedText>
        ) : null}
        <ThemedText
          style={[styles.label, { color: title ? palette.textSecondary : palette.text }]}
          numberOfLines={title ? 1 : 2}
        >
          {label}
        </ThemedText>
        {detail ? (
          <ThemedText style={[styles.detail, { color: palette.textSecondary }]} numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[styles.durationPill, { backgroundColor: withOpacity(palette.timeHighlight, 0.12) }]}
      >
        <ThemedText style={[styles.durationText, { color: palette.timeHighlight }]}>
          {duration}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
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
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
  },
  durationPill: {
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
