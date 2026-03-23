import { ThemeLayout } from '@/constants/theme';
import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type HeaderActionsProps = {
  children: ReactNode;
  hidden?: boolean;
};

export function HeaderActions({ children, hidden = false }: HeaderActionsProps) {
  return (
    <View
      style={[
        ThemeLayout.headerRightView,
        ThemeLayout.headerActions,
        hidden ? styles.hidden : null,
      ]}
      pointerEvents={hidden ? 'none' : 'auto'}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
});
