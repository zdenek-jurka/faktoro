import { ThemedText } from '@/components/themed-text';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { IconSymbol } from './icon-symbol';
import { SwipeableRow } from './swipeable-row';

type GroupedListRowProps = {
  children: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  accessibilityLabel?: string;
  isFirst?: boolean;
  isLast?: boolean;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
  mainStyle?: StyleProp<ViewStyle>;
  trailingStyle?: StyleProp<ViewStyle>;
};

export function GroupedListRow({
  children,
  trailing,
  leading,
  onPress,
  onEdit,
  onDelete,
  accessibilityLabel,
  isFirst = false,
  isLast = false,
  showChevron = false,
  style,
  mainStyle,
  trailingStyle,
}: GroupedListRowProps) {
  const palette = usePalette();

  return (
    <SwipeableRow onEdit={onEdit} onDelete={onDelete}>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: palette.cardBackground },
          isFirst && styles.rowFirst,
          isLast && styles.rowLast,
          pressed && !!onPress && styles.rowPressed,
          style,
        ]}
        onPress={onPress}
        disabled={!onPress}
        android_ripple={onPress ? { color: palette.border } : undefined}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.rowContent}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <View style={[styles.main, mainStyle]}>{children}</View>
          {(trailing || showChevron) && (
            <View style={[styles.trailing, trailingStyle]}>
              {trailing ? <View style={styles.trailingContent}>{trailing}</View> : null}
              {showChevron ? (
                <IconSymbol name="chevron.right" size={20} color={palette.icon} />
              ) : null}
            </View>
          )}
        </View>
        {!isLast && <View style={[styles.divider, { backgroundColor: palette.border }]} />}
      </Pressable>
    </SwipeableRow>
  );
}

type GroupedListSectionProps = {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GroupedListSection({ title, children, style }: GroupedListSectionProps) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
          {title}
        </ThemedText>
      ) : null}
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.sm,
    opacity: 0.65,
    paddingHorizontal: 2,
    textTransform: 'uppercase',
  },
  row: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowFirst: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  leading: {
    flexShrink: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  trailing: {
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '42%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  trailingContent: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  divider: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});
