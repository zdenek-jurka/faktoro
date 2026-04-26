import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function usePalette() {
  const colorScheme = useColorScheme();
  return Colors[colorScheme];
}
