import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { isAndroid } from '@/utils/platform';

import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';

type CrossPlatformDatePickerProps = {
  visible: boolean;
  value: Date;
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (selectedDate: Date) => void;
  onValueChange?: (selectedDate: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

export function CrossPlatformDatePicker({
  visible,
  value,
  title,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  onValueChange,
  minimumDate,
  maximumDate,
}: CrossPlatformDatePickerProps) {
  const palette = usePalette();
  const cardStyle = useBottomSafeAreaStyle(styles.card);

  if (!visible) return null;

  const handleDatePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (isAndroid) {
      if (event.type === 'dismissed') {
        onCancel();
        return;
      }

      const timestamp = event.nativeEvent?.timestamp;
      const resolvedDate =
        selected || (typeof timestamp === 'number' ? new Date(timestamp) : undefined);
      if (!resolvedDate) return;
      onValueChange?.(resolvedDate);
      onConfirm(resolvedDate);
      return;
    }

    if (selected) {
      onValueChange?.(selected);
    }
  };

  if (isAndroid) {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={handleDatePickerChange}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
      />
    );
  }

  return (
    <View style={[styles.overlay, { backgroundColor: palette.overlayBackdropSubtle }]}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <ThemedView
        style={[
          cardStyle,
          {
            backgroundColor: palette.background,
            borderColor: palette.inputBorder,
          },
        ]}
      >
        <ThemedText style={styles.title}>{title}</ThemedText>
        <DateTimePicker
          value={value}
          mode="date"
          display="spinner"
          onChange={handleDatePickerChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, { backgroundColor: palette.buttonNeutralBackground }]}
            onPress={onCancel}
          >
            <ThemedText style={{ color: palette.textMuted }}>{cancelLabel}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.actionButton, { backgroundColor: palette.tint }]}
            onPress={() => onConfirm(value)}
          >
            <ThemedText style={{ color: palette.onTint }}>{confirmLabel}</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  backdrop: {
    flex: 1,
  },
  card: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
