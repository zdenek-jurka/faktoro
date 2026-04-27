import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { isAndroid } from '@/utils/platform';

import { ThemedText } from '../themed-text';
import { ThemedView } from '../themed-view';

export type CrossPlatformDateTimePickerMode = 'date' | 'time';

type CrossPlatformDateTimePickerProps = {
  visible: boolean;
  value: Date;
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  mode: CrossPlatformDateTimePickerMode;
  onCancel: () => void;
  onConfirm: (selectedDate: Date) => void;
  onValueChange?: (selectedDate: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  is24Hour?: boolean;
};

type CrossPlatformDatePickerProps = Omit<CrossPlatformDateTimePickerProps, 'is24Hour' | 'mode'>;

export function CrossPlatformDateTimePicker({
  visible,
  value,
  title,
  cancelLabel,
  confirmLabel,
  mode,
  onCancel,
  onConfirm,
  onValueChange,
  minimumDate,
  maximumDate,
  is24Hour = true,
}: CrossPlatformDateTimePickerProps) {
  const palette = usePalette();
  const cardStyle = useBottomSafeAreaStyle(styles.card);
  const [draftValue, setDraftValue] = React.useState(value);

  React.useEffect(() => {
    if (visible) setDraftValue(value);
  }, [value, visible]);

  if (!visible) return null;

  const handleDateTimePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (isAndroid) {
      if (event.type === 'dismissed') {
        onCancel();
        return;
      }

      const timestamp = event.nativeEvent?.timestamp;
      const resolvedDate =
        selected || (typeof timestamp === 'number' ? new Date(timestamp) : undefined);
      if (!resolvedDate) return;
      setDraftValue(resolvedDate);
      onValueChange?.(resolvedDate);
      onConfirm(resolvedDate);
      return;
    }

    if (selected) {
      setDraftValue(selected);
      onValueChange?.(selected);
    }
  };

  const dateBounds = mode === 'date' ? { minimumDate, maximumDate } : {};
  const timeOptions = mode === 'time' && isAndroid ? { is24Hour } : {};

  if (isAndroid) {
    return (
      <DateTimePicker
        value={draftValue}
        mode={mode}
        display="default"
        onChange={handleDateTimePickerChange}
        {...dateBounds}
        {...timeOptions}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdropSubtle }]}>
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
            value={draftValue}
            mode={mode}
            display="spinner"
            onChange={handleDateTimePickerChange}
            {...dateBounds}
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
              onPress={() => onConfirm(draftValue)}
            >
              <ThemedText style={{ color: palette.onTint }}>{confirmLabel}</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

export function CrossPlatformDatePicker(props: CrossPlatformDatePickerProps) {
  return <CrossPlatformDateTimePicker {...props} mode="date" />;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
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
