import { Colors, FontSizes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Deterministic hue from a string
function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getAvatarColor(name: string, isDark: boolean): { bg: string; fg: string } {
  const hue = stringToHue(name);
  if (isDark) {
    return { bg: hslToHex(hue, 40, 28), fg: hslToHex(hue, 70, 78) };
  }
  return { bg: hslToHex(hue, 55, 90), fg: hslToHex(hue, 55, 30) };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type InitialsAvatarProps = {
  name: string;
  size?: number;
  fontSize?: number;
};

export function InitialsAvatar({ name, size = 40, fontSize = FontSizes.md }: InitialsAvatarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { bg, fg } = getAvatarColor(name, isDark);
  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={[styles.text, { color: fg, fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
