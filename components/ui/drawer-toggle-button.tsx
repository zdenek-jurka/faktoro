import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { ParamListBase } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePendingSyncConflictCount } from '@/hooks/use-pending-sync-conflict-count';
import { useI18nContext } from '@/i18n/i18n-react';
import { getMoreSectionTitle } from '@/i18n/locale-options';
import { isIos } from '@/utils/platform';

import { IconButton } from './icon-button';

export function DrawerToggleButton() {
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>('/');
  const { locale } = useI18nContext();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const pendingConflictCount = usePendingSyncConflictCount();

  if (isIos) {
    return null;
  }

  return (
    <View style={styles.container}>
      <IconButton
        iconName="line.3.horizontal"
        onPress={() => navigation.openDrawer()}
        accessibilityLabel={getMoreSectionTitle(locale)}
      />
      {pendingConflictCount > 0 ? (
        <View style={[styles.dot, { backgroundColor: palette.destructive }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
