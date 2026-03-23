import type { ReactElement } from 'react';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollViewOffset,
} from 'react-native-reanimated';

import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

const HEADER_HEIGHT = 250;

type Props<T> = {
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };

  data: readonly T[];
  renderItem: ({ item, index }: { item: T; index: number }) => ReactElement | null;
  keyExtractor: (item: T, index: number) => string;

  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;

  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function ParallaxFlatList<T>({
  headerImage,
  headerBackgroundColor,
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
}: Props<T>) {
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme() ?? 'light';

  const listRef = useAnimatedRef<Animated.FlatList<T>>();
  const scrollOffset = useScrollViewOffset(listRef);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollOffset.value,
          [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
          [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75],
        ),
      },
      {
        scale: interpolate(scrollOffset.value, [-HEADER_HEIGHT, 0, HEADER_HEIGHT], [2, 1, 1]),
      },
    ],
  }));

  return (
    <Animated.FlatList
      ref={listRef}
      style={{ backgroundColor, flex: 1 }}
      scrollEventThrottle={16}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
      ListHeaderComponent={
        <>
          <Animated.View
            style={[
              styles.header,
              { backgroundColor: headerBackgroundColor[colorScheme] },
              headerAnimatedStyle,
            ]}
          >
            {headerImage}
          </Animated.View>

          <ThemedView style={styles.content}>{ListHeaderComponent ?? null}</ThemedView>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    padding: 32,
    gap: 16,
  },
  contentContainer: {
    paddingBottom: 24,
  },
});
