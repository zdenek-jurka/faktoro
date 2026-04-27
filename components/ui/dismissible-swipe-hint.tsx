import { ThemedText } from '@/components/themed-text';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { useDismissibleHint } from '@/hooks/use-dismissible-hint';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { IconSymbol } from './icon-symbol';

type DismissibleSwipeHintProps = {
  hintKey?: string;
  text?: string;
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function DismissibleSwipeHint({
  hintKey,
  text,
  visible = true,
  style,
}: DismissibleSwipeHintProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const swipeHint = useDismissibleHint(hintKey);

  if (!visible || !swipeHint.isVisible) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.infoBadgeBackground,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <IconSymbol name="sparkles" size={16} color={palette.infoBadgeText} />
      <ThemedText style={[styles.text, { color: palette.infoBadgeText }]}>
        {text || LL.common.swipeActionsHint()}
      </ThemedText>
      <Pressable
        style={styles.dismissButton}
        onPress={() => void swipeHint.dismiss()}
        accessibilityRole="button"
        accessibilityLabel={LL.common.dismiss()}
        hitSlop={8}
      >
        <IconSymbol name="xmark" size={16} color={palette.infoBadgeText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 18,
    fontWeight: '500',
  },
  dismissButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
