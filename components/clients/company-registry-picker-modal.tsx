import React from 'react';
import { Modal, ScrollView, StyleSheet, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type CompanyRegistryKey } from '@/repositories/company-registry';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMPANY_REGISTRY_OPTIONS,
  getRegistryLabel,
  type LookupLocalization,
} from './company-registry-lookup';

type Props = {
  visible: boolean;
  LL: LookupLocalization;
  options?: CompanyRegistryKey[];
  onClose: () => void;
  onSelect: (registryKey: CompanyRegistryKey) => void;
};

export function CompanyRegistryPickerModal({
  visible,
  LL,
  options = COMPANY_REGISTRY_OPTIONS,
  onClose,
  onSelect,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const sheetStyle = useBottomSafeAreaStyle(styles.sheet);
  const optionsContentStyle = useBottomSafeAreaStyle(styles.optionsContent);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]}>
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
            {LL.settings.companyRegistryDefault()}
          </ThemedText>
          <ScrollView style={styles.optionsList} contentContainerStyle={optionsContentStyle}>
            {options.map((registryKey, index) => (
              <Pressable
                key={registryKey}
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
                  onSelect(registryKey);
                }}
                accessibilityRole="button"
                accessibilityLabel={getRegistryLabel(LL, registryKey)}
              >
                <ThemedText style={styles.optionText}>
                  {getRegistryLabel(LL, registryKey)}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
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
    maxHeight: '70%',
  },
  title: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionsList: {
    maxHeight: 360,
  },
  optionsContent: {
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
