import { ThemedText } from '@/components/themed-text';
import { usePalette } from '@/hooks/use-palette';
import React, { useMemo, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputContentSizeChangeEventData,
  View,
} from 'react-native';

type LabeledAutoGrowTextAreaProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  minHeight?: number;
  numberOfLines?: number;
};

export function LabeledAutoGrowTextArea({
  label,
  value,
  onChangeText,
  placeholder,
  minHeight = 84,
  numberOfLines = 3,
}: LabeledAutoGrowTextAreaProps) {
  const palette = usePalette();
  const [inputHeight, setInputHeight] = useState(minHeight);

  const effectiveHeight = useMemo(() => Math.max(minHeight, inputHeight), [minHeight, inputHeight]);

  const handleContentSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => {
    const contentHeight = Math.ceil(event.nativeEvent.contentSize.height);
    const targetHeight = contentHeight + 24;
    setInputHeight(targetHeight);
  };

  return (
    <View>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
            backgroundColor: palette.inputBackground,
            height: effectiveHeight,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        value={value}
        onChangeText={onChangeText}
        multiline
        numberOfLines={numberOfLines}
        textAlignVertical="top"
        onContentSizeChange={handleContentSizeChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
