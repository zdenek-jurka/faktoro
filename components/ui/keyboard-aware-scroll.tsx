import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  TextInput,
  type ViewStyle,
} from 'react-native';
import { isIos } from '@/utils/platform';

const ANDROID_KEYBOARD_INPUT_MARGIN = 56;

type KeyboardAwareScrollProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollViewStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
} & Pick<ScrollViewProps, 'keyboardShouldPersistTaps' | 'showsVerticalScrollIndicator'>;

export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  keyboardVerticalOffset,
  scrollViewStyle,
  style,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = true,
}: KeyboardAwareScrollProps) {
  const headerHeight = useHeaderHeight();
  const scrollViewRef = useRef<ScrollView>(null);
  const keyboardScreenYRef = useRef<number | null>(null);
  const scrollOffsetYRef = useRef(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const flattenedContentContainerStyle = useMemo(
    () => StyleSheet.flatten(contentContainerStyle) ?? {},
    [contentContainerStyle],
  );
  const safeAreaContentContainerStyle = useBottomSafeAreaStyle(flattenedContentContainerStyle);
  const resolvedKeyboardVerticalOffset = keyboardVerticalOffset ?? (isIos ? headerHeight : 0);
  const resolvedContentContainerStyle =
    isIos && isKeyboardVisible ? flattenedContentContainerStyle : safeAreaContentContainerStyle;

  const scrollFocusedInputIntoView = useCallback(() => {
    if (isIos) return;
    const keyboardScreenY = keyboardScreenYRef.current;
    const focusedInput = TextInput.State.currentlyFocusedInput() as {
      measureInWindow?: (
        callback: (x: number, y: number, width: number, height: number) => void,
      ) => void;
    } | null;

    if (keyboardScreenY == null || !focusedInput?.measureInWindow) return;

    focusedInput.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + ANDROID_KEYBOARD_INPUT_MARGIN - keyboardScreenY;
      if (overlap <= 0) return;

      scrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollOffsetYRef.current + overlap),
        animated: true,
      });
    });
  }, []);

  useEffect(() => {
    const showEvent = isIos ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIos ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardScreenYRef.current = event.endCoordinates.screenY;
      setIsKeyboardVisible(true);
      if (!isIos) {
        requestAnimationFrame(() => requestAnimationFrame(scrollFocusedInputIntoView));
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardScreenYRef.current = null;
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollFocusedInputIntoView]);

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoiding, style]}
      behavior={isIos ? 'padding' : undefined}
      keyboardVerticalOffset={resolvedKeyboardVerticalOffset}
    >
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, scrollViewStyle]}
        contentContainerStyle={resolvedContentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        onScroll={(event) => {
          scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onFocusCapture={() => {
          if (!isIos && isKeyboardVisible) {
            requestAnimationFrame(scrollFocusedInputIntoView);
          }
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
});
