/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';
import { isIos } from '@/utils/platform';

const tintColorLight = '#007AFF';
const tintColorDark = '#0A84FF';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#555',
    textMuted: '#6E6E73',
    onTint: '#fff',
    onHighlight: '#fff',
    onDestructive: '#fff',
    background: '#FFFFFF',
    backgroundSubtle: '#F2F2F7',
    tint: tintColorLight,
    icon: '#8E8E93',
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorLight,
    cardBackground: '#FFFFFF',
    cardBackgroundElevated: '#FFFFFF',
    border: '#E5E5EA',
    borderStrong: '#C7C7CC',
    destructive: '#FF3B30',
    success: '#34C759',
    inputBorder: '#C7C7CC',
    inputBackground: '#FFFFFF',
    placeholder: '#8E8E93',
    buttonNeutralBackground: '#E5E5EA',
    infoBadgeBackground: '#EAF2FF',
    infoBadgeText: '#0056CC',
    timerPause: '#FF9500',
    timerStop: '#FF3B30',
    timeHighlight: '#007AFF',
    overlayBackdrop: 'rgba(0, 0, 0, 0.5)',
    overlayBackdropSoft: 'rgba(0, 0, 0, 0.45)',
    overlayBackdropSubtle: 'rgba(0, 0, 0, 0.4)',
    qrCodeBackground: '#fff',
  },
  dark: {
    text: '#EBEBF5',
    textSecondary: 'rgba(235, 235, 245, 0.6)',
    textMuted: '#8E8E93',
    onTint: '#fff',
    onHighlight: '#fff',
    onDestructive: '#fff',
    background: '#1C1C1E',
    backgroundSubtle: '#000000',
    tint: tintColorDark,
    icon: '#8E8E93',
    tabIconDefault: '#636366',
    tabIconSelected: tintColorDark,
    cardBackground: '#1C1C1E',
    cardBackgroundElevated: '#2C2C2E',
    border: '#38383A',
    borderStrong: '#48484A',
    destructive: '#FF453A',
    success: '#30D158',
    inputBorder: '#38383A',
    inputBackground: '#1C1C1E',
    placeholder: '#636366',
    buttonNeutralBackground: '#2C2C2E',
    infoBadgeBackground: '#0A3060',
    infoBadgeText: '#5AC8FA',
    timerPause: '#FF9F0A',
    timerStop: '#FF453A',
    timeHighlight: '#0A84FF',
    overlayBackdrop: 'rgba(0, 0, 0, 0.65)',
    overlayBackdropSoft: 'rgba(0, 0, 0, 0.6)',
    overlayBackdropSubtle: 'rgba(0, 0, 0, 0.55)',
    qrCodeBackground: '#fff',
  },
};

type ThemePalette = (typeof Colors)['light'];

export function getSwitchColors(palette: ThemePalette) {
  return {
    trackColor: {
      false: palette.inputBorder,
      true: palette.success,
    },
    ios_backgroundColor: palette.inputBorder,
  };
}

function normalizeHexColor(hexColor: string): string | null {
  const raw = hexColor.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^[0-9a-fA-F]{8}$/.test(raw)) return raw.slice(0, 6);
  return null;
}

export function withOpacity(hexColor: string, opacity: number): string {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) return hexColor;
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampedOpacity})`;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * Border radius values for consistent rounded corners throughout the app
 */
export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

/**
 * Border width values for consistent borders throughout the app
 */
export const BorderWidth = {
  none: 0,
  hairline: 0.5,
  thin: 1,
  base: 2,
  thick: 3,
  heavy: 4,
} as const;

/**
 * Spacing scale for consistent margins and paddings
 */
export const Spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

/**
 * Font size scale
 */
export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

/**
 * Icon size scale
 */
export const IconSizes = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
} as const;

/**
 * Shadow presets (iOS-style)
 */
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/**
 * Opacity values
 */
export const Opacity = {
  disabled: 0.4,
  muted: 0.5,
  subtle: 0.6,
  medium: 0.7,
  strong: 0.9,
} as const;

/**
 * Shared layout styles used across screens
 */
export const ThemeLayout = {
  headerRightView: {
    margin: 0,
    marginHorizontal: 0,
    marginVertical: 0,
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: 0,
    ...(isIos && {
      transform: [{ translateY: -4 }],
    }),
  },
} as const;
