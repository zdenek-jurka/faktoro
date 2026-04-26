import type { ColorSchemeName } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

export function resolveColorScheme(value: ColorSchemeName): AppColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}
