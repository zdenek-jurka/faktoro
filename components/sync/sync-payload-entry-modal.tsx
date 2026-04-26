import { BottomSheetFormModal } from '@/components/ui/bottom-sheet-form-modal';
import { usePalette } from '@/hooks/use-palette';
import React from 'react';
import { StyleSheet, TextInput } from 'react-native';

type SyncPayloadEntryModalProps = {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function SyncPayloadEntryModal({
  visible,
  title,
  placeholder,
  value,
  onChangeText,
  onClose,
  onSave,
}: SyncPayloadEntryModalProps) {
  const palette = usePalette();

  return (
    <BottomSheetFormModal visible={visible} onClose={onClose} onSave={onSave} title={title}>
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
            backgroundColor: palette.inputBackground,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        value={value}
        onChangeText={onChangeText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />
    </BottomSheetFormModal>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 140,
    fontSize: 13,
    fontFamily: 'monospace',
  },
});
