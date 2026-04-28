import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppButton } from '@/components/ui/app-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePalette } from '@/hooks/use-palette';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type ActionEmptyStateProps = {
  iconName: React.ComponentProps<typeof IconSymbol>['name'];
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActionEmptyState({
  iconName,
  title,
  description,
  actionLabel,
  onActionPress,
  style,
}: ActionEmptyStateProps) {
  const palette = usePalette();

  return (
    <ThemedView
      style={[
        styles.container,
        {
          backgroundColor: palette.infoBadgeBackground,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: palette.tint }]}>
          <IconSymbol name={iconName} size={20} color={palette.onTint} />
        </View>
        <View style={styles.copy}>
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText style={styles.description}>{description}</ThemedText>
        </View>
      </View>

      {actionLabel && onActionPress ? (
        <AppButton
          label={actionLabel}
          onPress={onActionPress}
          size="compact"
          fullWidth={false}
          style={styles.actionButton}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.75,
  },
  actionButton: { minHeight: 40 },
});
