import { Fonts } from '@/constants/theme';
import { StyleSheet, Text, View } from 'react-native';

type Palette = {
  text: string;
  textSecondary: string;
  timeHighlight: string;
  success: string;
  onHighlight: string;
  cardBackground: string;
};

type AppBrandProps = {
  palette: Palette;
  size?: number;
};

export function AppBrand({ palette, size = 44 }: AppBrandProps) {
  const markSize = size + 6;
  const baseInset = Math.round(markSize * 0.12);
  const baseRadius = Math.round(markSize * 0.28);
  const verticalBarWidth = Math.round(markSize * 0.18);
  const verticalBarHeight = Math.round(markSize * 0.66);
  const horizontalBarHeight = Math.round(markSize * 0.13);
  const topBarWidth = Math.round(markSize * 0.5);
  const middleBarWidth = Math.round(markSize * 0.38);
  const badgeSize = Math.round(markSize * 0.28);
  const highlightWidth = Math.round(markSize * 0.28);
  const highlightHeight = Math.round(markSize * 0.28);

  return (
    <View style={styles.container}>
      <View style={[styles.markShell, { width: markSize, height: markSize }]}>
        <View
          style={[
            styles.markBase,
            {
              top: baseInset,
              right: baseInset,
              bottom: baseInset,
              left: baseInset,
              borderRadius: baseRadius,
              backgroundColor: palette.timeHighlight,
            },
          ]}
        />
        <View
          style={[
            styles.markHighlight,
            {
              top: baseInset,
              right: baseInset,
              width: highlightWidth,
              height: highlightHeight,
              borderTopRightRadius: baseRadius,
              borderBottomLeftRadius: Math.round(baseRadius * 0.9),
            },
          ]}
        />
        <View
          style={[
            styles.markBar,
            {
              left: baseInset + Math.round(markSize * 0.2),
              top: baseInset + Math.round(markSize * 0.16),
              width: verticalBarWidth,
              height: verticalBarHeight,
              borderRadius: Math.round(verticalBarWidth / 2),
            },
          ]}
        />
        <View
          style={[
            styles.markBar,
            {
              left: baseInset + Math.round(markSize * 0.2),
              top: baseInset + Math.round(markSize * 0.16),
              width: topBarWidth,
              height: horizontalBarHeight,
              borderRadius: Math.round(horizontalBarHeight / 2),
            },
          ]}
        />
        <View
          style={[
            styles.markBar,
            {
              left: baseInset + Math.round(markSize * 0.2),
              top: baseInset + Math.round(markSize * 0.4),
              width: middleBarWidth,
              height: horizontalBarHeight,
              borderRadius: Math.round(horizontalBarHeight / 2),
            },
          ]}
        />
        <View
          style={[
            styles.markBadge,
            {
              right: baseInset - Math.round(markSize * 0.02),
              bottom: baseInset - Math.round(markSize * 0.02),
              width: badgeSize,
              height: badgeSize,
              borderRadius: Math.round(badgeSize / 2),
              backgroundColor: palette.success,
            },
          ]}
        />
      </View>

      <Text style={[styles.wordmark, { color: palette.text }]}>Faktoro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  markShell: {
    position: 'relative',
    flexShrink: 0,
  },
  markBase: {
    position: 'absolute',
  },
  markHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  markBar: {
    position: 'absolute',
    backgroundColor: '#fff',
  },
  markBadge: {
    position: 'absolute',
  },
  wordmark: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
