import { ThemedText } from '@/components/themed-text';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { IconSymbol, type IconSymbolName } from './icon-symbol';

type AppButtonVariant = 'primary' | 'secondary' | 'destructive' | 'dangerOutline' | 'ghost';
type AppButtonSize = 'regular' | 'compact';

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  iconName?: IconSymbolName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  iconName,
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
  style,
  textStyle,
  numberOfLines = 1,
}: AppButtonProps) {
  const palette = usePalette();
  const isDisabled = disabled || loading;

  const colors = (() => {
    if (isDisabled) {
      return {
        backgroundColor:
          variant === 'primary' || variant === 'destructive'
            ? palette.border
            : palette.buttonNeutralBackground,
        borderColor: variant === 'ghost' ? 'transparent' : palette.border,
        foregroundColor: palette.icon,
      };
    }

    if (variant === 'primary') {
      return {
        backgroundColor: palette.tint,
        borderColor: palette.tint,
        foregroundColor: palette.onTint,
      };
    }
    if (variant === 'destructive') {
      return {
        backgroundColor: palette.destructive,
        borderColor: palette.destructive,
        foregroundColor: palette.onDestructive,
      };
    }
    if (variant === 'dangerOutline') {
      return {
        backgroundColor: palette.cardBackground,
        borderColor: palette.destructive,
        foregroundColor: palette.destructive,
      };
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        foregroundColor: palette.tint,
      };
    }
    return {
      backgroundColor: palette.cardBackground,
      borderColor: palette.border,
      foregroundColor: palette.text,
    };
  })();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === 'compact' ? styles.compact : styles.regular,
        fullWidth ? styles.fullWidth : styles.inline,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          opacity: pressed && !isDisabled ? 0.82 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.foregroundColor} />
      ) : iconName ? (
        <IconSymbol
          name={iconName}
          size={size === 'compact' ? 15 : 18}
          color={colors.foregroundColor}
        />
      ) : null}
      <ThemedText
        style={[
          styles.label,
          size === 'compact' ? styles.compactLabel : styles.regularLabel,
          { color: colors.foregroundColor },
          textStyle,
        ]}
        numberOfLines={numberOfLines}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  regular: {
    minHeight: 50,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  compact: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    gap: 6,
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    textAlign: 'center',
  },
  regularLabel: {
    fontSize: FontSizes.base,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
});
