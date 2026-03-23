import { useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function resolveBottomPadding(style: ViewStyle): number {
  if (typeof style.paddingBottom === 'number') return style.paddingBottom;
  if (typeof style.paddingVertical === 'number') return style.paddingVertical;
  if (typeof style.padding === 'number') return style.padding;
  return 0;
}

export function useBottomSafeAreaStyle(style?: StyleProp<ViewStyle>): ViewStyle {
  const { bottom } = useSafeAreaInsets();

  return useMemo(() => {
    const flattenedStyle = StyleSheet.flatten(style) ?? {};
    const basePaddingBottom = resolveBottomPadding(flattenedStyle);

    return {
      ...flattenedStyle,
      paddingBottom: basePaddingBottom + bottom,
    };
  }, [bottom, style]);
}
