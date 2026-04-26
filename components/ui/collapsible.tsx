import { PropsWithChildren, ReactNode, useState } from 'react';
import { StyleSheet, Pressable, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePalette } from '@/hooks/use-palette';

interface CollapsibleProps extends PropsWithChildren {
  title?: string;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  chevronPosition?: 'left' | 'right';
  headerStyle?: ViewStyle;
  contentStyle?: ViewStyle;
}

export function Collapsible({
  children,
  title,
  headerLeft,
  headerRight,
  defaultOpen = false,
  chevronPosition = 'left',
  headerStyle,
  contentStyle,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const palette = usePalette();

  const chevronIcon = (
    <IconSymbol
      name={chevronPosition === 'left' ? 'chevron.right' : isOpen ? 'chevron.up' : 'chevron.down'}
      size={18}
      weight="medium"
      color={palette.icon}
      style={
        chevronPosition === 'left'
          ? { transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }
          : undefined
      }
    />
  );

  return (
    <ThemedView>
      <Pressable style={[styles.heading, headerStyle]} onPress={() => setIsOpen((value) => !value)}>
        {chevronPosition === 'left' && chevronIcon}
        {headerLeft}
        {title && <ThemedText type="defaultSemiBold">{title}</ThemedText>}
        {headerRight}
        {chevronPosition === 'right' && chevronIcon}
      </Pressable>
      {isOpen && <ThemedView style={[styles.content, contentStyle]}>{children}</ThemedView>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
