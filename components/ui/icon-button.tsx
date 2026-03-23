import { usePalette } from '@/hooks/use-palette';
import React from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { isAndroid, isIos } from '@/utils/platform';
import { IconSymbol, IconSymbolName } from './icon-symbol';

type IconButtonVariant = 'tint' | 'neutral' | 'ghost' | 'destructive';

type IconButtonProps = {
  iconName: IconSymbolName;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, 'style'>;

export function IconButton({
  iconName,
  accessibilityLabel,
  variant = 'ghost',
  iconSize = 20,
  hitSlop = 8,
  style,
  ...props
}: IconButtonProps) {
  const palette = usePalette();
  const iconStyle = isIos ? styles.iconIos : undefined;

  const backgroundColor =
    variant === 'tint'
      ? palette.tint
      : variant === 'neutral'
        ? palette.buttonNeutralBackground
        : variant === 'destructive'
          ? palette.destructive
          : 'transparent';

  const iconColor =
    variant === 'tint'
      ? palette.onTint
      : variant === 'destructive'
        ? palette.onDestructive
        : palette.icon;

  return (
    <Pressable
      {...props}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
      android_ripple={{ color: palette.border, borderless: true }}
    >
      <IconSymbol name={iconName} size={iconSize} color={iconColor} style={iconStyle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: isAndroid ? 48 : 44,
    minHeight: isAndroid ? 48 : 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: isAndroid ? 24 : 22,
    padding: 4,
  },
  iconIos: {},
});
