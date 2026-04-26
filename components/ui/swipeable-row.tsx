import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { IconSymbol } from './icon-symbol';

const ACTION_REVEAL_WIDTH = 100;

interface SwipeableRowProps {
  onDelete?: () => void;
  onEdit?: () => void;
  borderRadius?: number;
  children: React.ReactNode;
}

export function SwipeableRow({ onDelete, onEdit, borderRadius = 0, children }: SwipeableRowProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const canSwipe = !!onDelete || !!onEdit;

  const accessibilityActions = [
    ...(onEdit ? [{ name: 'edit', label: LL.common.edit() }] : []),
    ...(onDelete ? [{ name: 'delete', label: LL.common.delete() }] : []),
  ];

  const handleAccessibilityAction = (actionName: string) => {
    if (actionName === 'edit' && onEdit) onEdit();
    if (actionName === 'delete' && onDelete) onDelete();
  };

  const handleSwipeableOpen = (direction: SwipeDirection.LEFT | SwipeDirection.RIGHT) => {
    if (direction === SwipeDirection.LEFT && onDelete) {
      onDelete();
    } else if (direction === SwipeDirection.RIGHT && onEdit) {
      onEdit();
    }
    requestAnimationFrame(() => {
      swipeableRef.current?.close();
    });
  };

  if (!canSwipe) {
    return <View style={[styles.container, borderRadius > 0 && { borderRadius }]}>{children}</View>;
  }

  return (
    <View style={[styles.container, borderRadius > 0 && { borderRadius }]}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        leftThreshold={36}
        rightThreshold={36}
        dragOffsetFromLeftEdge={8}
        dragOffsetFromRightEdge={8}
        overshootLeft={false}
        overshootRight={false}
        onSwipeableOpen={handleSwipeableOpen}
        containerStyle={styles.swipeableContainer}
        renderLeftActions={
          onEdit
            ? () => (
                <View
                  style={[
                    styles.actionBase,
                    styles.leftAction,
                    { backgroundColor: palette.timeHighlight },
                    borderRadius > 0 && {
                      borderTopLeftRadius: borderRadius,
                      borderBottomLeftRadius: borderRadius,
                    },
                  ]}
                >
                  <IconSymbol name="pencil" size={24} color={palette.onHighlight} />
                </View>
              )
            : undefined
        }
        renderRightActions={
          onDelete
            ? () => (
                <View
                  style={[
                    styles.actionBase,
                    styles.rightAction,
                    { backgroundColor: palette.timerStop },
                    borderRadius > 0 && {
                      borderTopRightRadius: borderRadius,
                      borderBottomRightRadius: borderRadius,
                    },
                  ]}
                >
                  <IconSymbol name="trash.fill" size={24} color={palette.onDestructive} />
                </View>
              )
            : undefined
        }
      >
        <View
          style={[
            styles.content,
            { backgroundColor: palette.cardBackground },
            borderRadius > 0 && { borderRadius },
          ]}
          accessible
          accessibilityRole="button"
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={(event) => handleAccessibilityAction(event.nativeEvent.actionName)}
        >
          {children}
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  swipeableContainer: {
    overflow: 'hidden',
  },
  content: {
    backgroundColor: 'transparent',
  },
  actionBase: {
    width: ACTION_REVEAL_WIDTH,
    justifyContent: 'center',
  },
  leftAction: {
    alignItems: 'flex-start',
    paddingLeft: 20,
  },
  rightAction: {
    alignItems: 'flex-end',
    paddingRight: 20,
  },
});
