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
const IOS_KEYBOARD_INPUT_MARGIN = 24;
const INPUT_VISIBLE_TOP_MARGIN = 16;

function resolveBottomPadding(style: ViewStyle): number {
  if (typeof style.paddingBottom === 'number') return style.paddingBottom;
  if (typeof style.paddingVertical === 'number') return style.paddingVertical;
  if (typeof style.padding === 'number') return style.padding;
  return 0;
}

type KeyboardAwareScrollProps = {
  children: ReactNode;
  enableAndroidKeyboardBottomPadding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollViewStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
} & Pick<ScrollViewProps, 'keyboardShouldPersistTaps' | 'showsVerticalScrollIndicator'>;

export function KeyboardAwareScroll({
  children,
  enableAndroidKeyboardBottomPadding = false,
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const flattenedContentContainerStyle = useMemo(
    () => StyleSheet.flatten(contentContainerStyle) ?? {},
    [contentContainerStyle],
  );
  const safeAreaContentContainerStyle = useBottomSafeAreaStyle(flattenedContentContainerStyle);
  const resolvedKeyboardVerticalOffset = keyboardVerticalOffset ?? (isIos ? headerHeight : 0);
  const resolvedContentContainerStyle = useMemo(() => {
    if (isIos && isKeyboardVisible) {
      return flattenedContentContainerStyle;
    }

    if (!isIos && enableAndroidKeyboardBottomPadding && isKeyboardVisible && keyboardHeight > 0) {
      const basePaddingBottom = resolveBottomPadding(safeAreaContentContainerStyle);
      return {
        ...safeAreaContentContainerStyle,
        paddingBottom: basePaddingBottom + keyboardHeight,
      };
    }

    return safeAreaContentContainerStyle;
  }, [
    flattenedContentContainerStyle,
    enableAndroidKeyboardBottomPadding,
    isKeyboardVisible,
    keyboardHeight,
    safeAreaContentContainerStyle,
  ]);

  const scrollFocusedInputIntoView = useCallback(() => {
    const keyboardScreenY = keyboardScreenYRef.current;
    const scrollView = scrollViewRef.current as {
      measureInWindow?: (
        callback: (x: number, y: number, width: number, height: number) => void,
      ) => void;
      scrollTo: (options: { x?: number; y?: number; animated?: boolean }) => void;
    } | null;
    const focusedInput = TextInput.State.currentlyFocusedInput() as {
      measureInWindow?: (
        callback: (x: number, y: number, width: number, height: number) => void,
      ) => void;
    } | null;

    if (keyboardScreenY == null || !focusedInput?.measureInWindow || !scrollView?.measureInWindow) {
      return;
    }

    scrollView.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
      const visibleTop = scrollY + INPUT_VISIBLE_TOP_MARGIN;
      const bottomMargin = isIos ? IOS_KEYBOARD_INPUT_MARGIN : ANDROID_KEYBOARD_INPUT_MARGIN;
      const visibleBottom = Math.min(scrollY + scrollHeight, keyboardScreenY) - bottomMargin;
      const visibleHeight = visibleBottom - visibleTop;

      if (visibleHeight <= 0) return;

      focusedInput.measureInWindow((_x, inputY, _width, inputHeight) => {
        const inputTop = inputY;
        const inputBottom = inputY + inputHeight;
        const fitsFully = inputHeight <= visibleHeight;

        let delta = 0;
        if (fitsFully) {
          if (inputTop < visibleTop) {
            delta = inputTop - visibleTop;
          } else if (inputBottom > visibleBottom) {
            delta = inputBottom - visibleBottom;
          }
        } else if (inputTop !== visibleTop) {
          // If the whole field cannot fit, prefer showing its top edge and the beginning of the text.
          delta = inputTop - visibleTop;
        }

        if (delta === 0) return;

        scrollView.scrollTo({
          y: Math.max(0, scrollOffsetYRef.current + delta),
          animated: true,
        });
      });
    });
  }, []);

  useEffect(() => {
    const showEvent = isIos ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIos ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardScreenYRef.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height || 0);
      setIsKeyboardVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(scrollFocusedInputIntoView));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardScreenYRef.current = null;
      setKeyboardHeight(0);
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
          if (isKeyboardVisible) {
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
