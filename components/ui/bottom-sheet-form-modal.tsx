import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, FontSizes, Spacing } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { isIos } from '@/utils/platform';
import React, { ReactNode, useEffect, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

interface BottomSheetFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  children: ReactNode;
  keyboardAvoidanceEnabled?: boolean;
}

export function BottomSheetFormModal({
  visible,
  onClose,
  onSave,
  title,
  children,
  keyboardAvoidanceEnabled = true,
}: BottomSheetFormModalProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const modalInnerStyle = useBottomSafeAreaStyle(styles.modalInner);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!keyboardAvoidanceEnabled) {
      setKeyboardHeight(0);
      return;
    }

    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [title, keyboardAvoidanceEnabled]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.flex}>
        <ModalContent
          palette={palette}
          modalInnerStyle={modalInnerStyle}
          title={title}
          onClose={onClose}
          onSave={onSave}
          LL={LL}
          contentStyle={[
            styles.content,
            { marginBottom: keyboardAvoidanceEnabled ? keyboardHeight : 0 },
          ]}
        >
          {children}
        </ModalContent>
      </View>
    </Modal>
  );
}

function ModalContent({
  palette,
  modalInnerStyle,
  title,
  onClose,
  onSave,
  LL,
  contentStyle,
  children,
}: {
  palette: (typeof Colors)['light'];
  modalInnerStyle: object;
  title: string;
  onClose: () => void;
  onSave: () => void;
  LL: ReturnType<typeof import('@/i18n/i18n-react').useI18nContext>['LL'];
  contentStyle: object | object[];
  children: ReactNode;
}) {
  return (
    <Pressable
      style={[styles.backdrop, { backgroundColor: palette.overlayBackdrop }]}
      onPress={onClose}
    >
      <View style={contentStyle} onStartShouldSetResponder={() => true}>
        <ThemedView style={modalInnerStyle}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={isIos ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <ThemedText type="title">{title}</ThemedText>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={LL.common.cancel()}
              >
                <IconSymbol name="xmark" size={24} color={palette.text} />
              </Pressable>
            </View>

            <View style={styles.formContent}>{children}</View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, { backgroundColor: palette.buttonNeutralBackground }]}
                onPress={onClose}
              >
                <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                  {LL.common.cancel()}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: palette.tint }]}
                onPress={onSave}
              >
                <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
                  {LL.common.save()}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    maxHeight: '80%',
  },
  modalInner: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formContent: {
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 24,
  },
  button: {
    flex: 1,
    padding: 12,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  saveButtonText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
