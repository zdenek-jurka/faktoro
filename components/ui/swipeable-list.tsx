import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { DismissibleSwipeHint } from './dismissible-swipe-hint';
import { IconButton } from './icon-button';
import { IconSymbol, IconSymbolName } from './icon-symbol';
import { SwipeableRow } from './swipeable-row';

interface SwipeableListProps<T> {
  /** Icon name to display in header */
  iconName: IconSymbolName;
  /** Title text for the section */
  title: string;
  /** Array of items to display */
  items: T[];
  /** Callback when add button is pressed */
  onAdd?: () => void;
  /** Callback when item is deleted */
  onDelete: (item: T) => void;
  /** Callback when item is edited */
  onEdit?: (item: T) => void;
  /** Function to extract unique key from item */
  keyExtractor: (item: T) => string;
  /** Function to render the content of each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Text to show when list is empty */
  emptyText: string;
  /** Optional custom empty state */
  emptyState?: ReactNode;
  /** Custom background color for items (optional) */
  itemBackgroundColor?: string;
  /** Show add button in header */
  showAddButton?: boolean;
  /** Optional action rendered on the right side of the section header. */
  headerAction?: ReactNode;
  /** Persisted key for a dismissible swipe-actions hint. */
  swipeHintKey?: string;
  /** Optional custom text for the dismissible swipe-actions hint. */
  swipeHintText?: string;
}

export function SwipeableList<T>({
  iconName,
  title,
  items,
  onAdd,
  onDelete,
  onEdit,
  keyExtractor,
  renderItem,
  emptyText,
  emptyState,
  itemBackgroundColor,
  showAddButton = true,
  headerAction,
  swipeHintKey,
  swipeHintText,
}: SwipeableListProps<T>) {
  const palette = usePalette();
  const backgroundColor = itemBackgroundColor || palette.cardBackground;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSymbol name={iconName} size={20} color={palette.icon} />
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          {items.length > 0 && (
            <ThemedView style={[styles.countBadge, { backgroundColor: palette.timeHighlight }]}>
              <ThemedText style={[styles.countText, { color: palette.onHighlight }]}>
                {items.length}
              </ThemedText>
            </ThemedView>
          )}
        </View>
        {(headerAction || (showAddButton && onAdd)) && (
          <View style={styles.headerActions}>
            {headerAction}
            {showAddButton && onAdd && (
              <IconButton
                iconName="plus.circle.fill"
                onPress={onAdd}
                accessibilityLabel={`${title} add`}
              />
            )}
          </View>
        )}
      </View>

      <DismissibleSwipeHint
        hintKey={swipeHintKey}
        text={swipeHintText}
        visible={items.length > 0}
        style={styles.swipeHint}
      />

      {/* List */}
      {items.length === 0 ? (
        emptyState || <ThemedText style={styles.emptyText}>{emptyText}</ThemedText>
      ) : (
        <View
          style={[styles.infoBox, { backgroundColor }, items.length === 0 && styles.infoBoxEmpty]}
        >
          {items.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;

            return (
              <View
                key={keyExtractor(item)}
                style={[
                  styles.itemWrapper,
                  isFirst && styles.firstWrapper,
                  isLast && styles.lastWrapper,
                ]}
              >
                <SwipeableRow
                  onDelete={() => onDelete(item)}
                  onEdit={onEdit ? () => onEdit(item) : undefined}
                >
                  <View
                    style={[
                      styles.swipeContent,
                      { backgroundColor },
                      isFirst && styles.firstItem,
                      isLast && styles.lastItem,
                    ]}
                  >
                    <View style={styles.contentWithPadding}>{renderItem(item, index)}</View>
                    {index < items.length - 1 && (
                      <View style={[styles.divider, { borderBottomColor: palette.border }]} />
                    )}
                  </View>
                </SwipeableRow>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: FontSizes.lg,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: Spacing.sm,
  },
  swipeHint: {
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
    marginTop: 8,
  },
  infoBox: {
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: 0,
  },
  infoBoxEmpty: {
    paddingBottom: Spacing.md,
  },
  itemWrapper: {
    marginHorizontal: -Spacing.md,
  },
  firstWrapper: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  lastWrapper: {
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  swipeContent: {
    position: 'relative',
  },
  firstItem: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  lastItem: {
    borderBottomLeftRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
  },
  contentWithPadding: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  divider: {
    borderBottomWidth: 1,
    marginHorizontal: Spacing.md,
  },
});
