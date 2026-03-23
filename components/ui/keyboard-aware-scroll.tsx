import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { isIos } from '@/utils/platform';

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
  const safeAreaContentContainerStyle = useBottomSafeAreaStyle(contentContainerStyle);
  const resolvedKeyboardVerticalOffset = keyboardVerticalOffset ?? (isIos ? headerHeight : 0);

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoiding, style]}
      behavior={isIos ? 'padding' : undefined}
      keyboardVerticalOffset={resolvedKeyboardVerticalOffset}
    >
      <ScrollView
        style={[styles.scrollView, scrollViewStyle]}
        contentContainerStyle={safeAreaContentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
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
