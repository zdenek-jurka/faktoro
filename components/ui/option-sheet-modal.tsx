import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type OptionSheetItem = {
  key: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type OptionSheetModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  cancelLabel: string;
  options: OptionSheetItem[];
  onClose: () => void;
};

export function OptionSheetModal({
  visible,
  title,
  message,
  cancelLabel,
  options,
  onClose,
}: OptionSheetModalProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const sheetStyle = useBottomSafeAreaStyle(styles.sheet);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: palette.overlayBackdropSoft }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />
        <ThemedView
          style={[
            sheetStyle,
            {
              backgroundColor: palette.background,
              borderColor: palette.inputBorder,
            },
          ]}
        >
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
          <View style={styles.optionsList}>
            {options.map((option, index) => (
              <Pressable
                key={option.key}
                style={[
                  styles.optionButton,
                  index < options.length - 1
                    ? {
                        borderBottomColor: palette.inputBorder,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      }
                    : null,
                  option.disabled ? styles.optionDisabled : null,
                ]}
                onPress={() => {
                  if (option.disabled) return;
                  onClose();
                  option.onPress();
                }}
                android_ripple={{ color: palette.border }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <ThemedText
                  style={[
                    styles.optionText,
                    option.destructive ? { color: palette.destructive } : null,
                  ]}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.cancelButton, { borderTopColor: palette.inputBorder }]}
            onPress={onClose}
            android_ripple={{ color: palette.border }}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <ThemedText style={[styles.cancelText, { color: palette.textMuted }]}>
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 14,
    maxHeight: '72%',
  },
  title: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  message: {
    paddingHorizontal: 16,
    marginBottom: 10,
    opacity: 0.75,
  },
  optionsList: {
    paddingBottom: 4,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  optionDisabled: {
    opacity: 0.45,
  },
  optionText: {
    fontSize: 16,
  },
  cancelButton: {
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
