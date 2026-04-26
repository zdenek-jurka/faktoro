import { useColorScheme as useRNColorScheme } from 'react-native';
import { resolveColorScheme, type AppColorScheme } from '@/utils/color-scheme';

export function useColorScheme(): AppColorScheme {
  return resolveColorScheme(useRNColorScheme());
}
