import React from 'react';
import { Modal, StyleSheet, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getLocaleOptions, type LocaleLabelLocalization } from '@/i18n/locale-options';
import type { Locales } from '@/i18n/i18n-types';

type LanguagePickerLocalization = {
  common: {
    cancel: () => string;
  };
  settings: LocaleLabelLocalization['settings'] & {
    language: () => string;
  };
};

type Props = {
  visible: boolean;
  LL: LanguagePickerLocalization;
  currentLanguage: Locales;
  onClose: () => void;
  onSelect: (language: Locales) => void;
};

export function LanguagePickerModal({ visible, LL, currentLanguage, onClose, onSelect }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const sheetStyle = useBottomSafeAreaStyle(styles.sheet);

  const options: { value: Locales; label: string }[] = getLocaleOptions(LL);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: palette.overlayBackdropSoft }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={LL.common.cancel()}
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
            {LL.settings.language()}
          </ThemedText>
          <View style={styles.optionsList}>
            {options.map((option, index) => (
              <Pressable
                key={option.value}
                style={[
                  styles.optionButton,
                  index < options.length - 1
                    ? {
                        borderBottomColor: palette.inputBorder,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      }
                    : null,
                ]}
                onPress={() => {
                  onClose();
                  onSelect(option.value);
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <ThemedText style={styles.optionText}>
                  {option.label}
                  {option.value === currentLanguage ? ' \u2713' : ''}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.cancelButton, { borderTopColor: palette.inputBorder }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={LL.common.cancel()}
          >
            <ThemedText style={[styles.cancelText, { color: palette.textMuted }]}>
              {LL.common.cancel()}
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
  },
  title: {
    paddingHorizontal: 16,
    marginBottom: 10,
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
