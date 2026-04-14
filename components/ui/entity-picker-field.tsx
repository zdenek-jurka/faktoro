import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { isIos } from '@/utils/platform';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type EntityPickerOption = {
  value: string;
  label: string;
  searchText?: string;
  subtitle?: string;
};

type EntityPickerFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: EntityPickerOption[];
  title: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  emptySearchText?: string;
  noneOption?: EntityPickerOption;
  disabled?: boolean;
};

export function EntityPickerField({
  value,
  onValueChange,
  options,
  title,
  placeholder,
  searchPlaceholder,
  emptyText,
  emptySearchText,
  noneOption,
  disabled = false,
}: EntityPickerFieldProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const insets = useSafeAreaInsets();
  const modalContentStyle = useBottomSafeAreaStyle(styles.modalContent);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allOptions = useMemo(
    () => (noneOption ? [noneOption, ...options] : options),
    [noneOption, options],
  );
  const selectedOption = useMemo(
    () => allOptions.find((option) => option.value === value),
    [allOptions, value],
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return allOptions;
    return allOptions.filter((option) => {
      const labelMatch = option.label.toLocaleLowerCase().includes(normalizedQuery);
      const searchMatch = option.searchText?.toLocaleLowerCase().includes(normalizedQuery) ?? false;
      const subtitleMatch = option.subtitle?.toLocaleLowerCase().includes(normalizedQuery) ?? false;
      return labelMatch || searchMatch || subtitleMatch;
    });
  }, [allOptions, normalizedQuery]);

  const canOpen = !disabled && allOptions.length > 0;

  const closePicker = () => {
    setOpen(false);
    setSearchQuery('');
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: palette.inputBorder,
            backgroundColor: palette.background,
            opacity: pressed && canOpen ? 0.82 : canOpen ? 1 : 0.55,
          },
        ]}
        onPress={() => {
          if (!canOpen) return;
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={!canOpen}
      >
        <ThemedText
          style={[
            styles.triggerValue,
            { color: selectedOption ? palette.text : palette.placeholder },
          ]}
          numberOfLines={1}
        >
          {selectedOption?.label || placeholder}
        </ThemedText>
        <IconSymbol name="chevron.down" size={16} color={palette.icon} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent={true} onRequestClose={closePicker}>
        <KeyboardAvoidingView
          style={[
            styles.modalOverlay,
            { backgroundColor: palette.overlayBackdrop, paddingTop: insets.top + 12 },
          ]}
          behavior={isIos ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.modalBackdrop} onPress={closePicker} />
          <ThemedView
            style={[
              modalContentStyle,
              {
                borderColor: palette.inputBorder,
                backgroundColor: palette.cardBackgroundElevated,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="subtitle" style={styles.modalTitle}>
                {title}
              </ThemedText>
              <Pressable
                onPress={closePicker}
                accessibilityRole="button"
                accessibilityLabel={LL.common.cancel()}
              >
                <IconSymbol name="xmark" size={22} color={palette.text} />
              </Pressable>
            </View>

            <TextInput
              style={[
                styles.searchInput,
                {
                  color: palette.text,
                  borderColor: palette.inputBorder,
                  backgroundColor: palette.inputBackground,
                },
              ]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />

            <FlatList
              data={filteredOptions}
              keyExtractor={(item, index) => (item.value ? item.value : `__empty__${index}`)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const selected = item.value === value;

                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        backgroundColor: selected
                          ? withOpacity(palette.timeHighlight, colorScheme === 'dark' ? 0.24 : 0.12)
                          : 'transparent',
                        borderColor: selected
                          ? withOpacity(palette.timeHighlight, colorScheme === 'dark' ? 0.38 : 0.22)
                          : 'transparent',
                      },
                      pressed && styles.optionRowPressed,
                    ]}
                    onPress={() => {
                      onValueChange(item.value);
                      closePicker();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <View style={styles.optionTextBlock}>
                      <ThemedText style={styles.optionLabel}>{item.label}</ThemedText>
                      {item.subtitle ? (
                        <ThemedText
                          style={[styles.optionSubtitle, { color: palette.textSecondary }]}
                        >
                          {item.subtitle}
                        </ThemedText>
                      ) : null}
                    </View>
                    {selected ? (
                      <IconSymbol name="checkmark" size={18} color={palette.timeHighlight} />
                    ) : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <ThemedText style={[styles.emptyText, { color: palette.textSecondary }]}>
                    {normalizedQuery ? emptySearchText || emptyText : emptyText}
                  </ThemedText>
                </View>
              }
            />
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
    marginBottom: 12,
  },
  triggerValue: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  modalTitle: {
    marginRight: 12,
    flex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  optionRow: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionRowPressed: {
    opacity: 0.84,
  },
  optionTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  emptyState: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
