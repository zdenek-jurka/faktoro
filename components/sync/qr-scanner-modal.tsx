import { ThemedText } from '@/components/themed-text';
import { BorderRadius, Spacing, FontSizes } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  hint: string;
  cancelLabel: string;
  onScanned: (data: string) => void;
  onClose: () => void;
};

export function QrScannerModal({ visible, hint, cancelLabel, onScanned, onClose }: Props) {
  const palette = usePalette();
  const scannerFooterStyle = useBottomSafeAreaStyle(styles.footer);
  useCameraPermissions();
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: palette.background }]}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(event: { data: string }) => {
            if (hasScannedRef.current) return;
            const value = String(event.data ?? '').trim();
            if (!value) return;
            hasScannedRef.current = true;
            onScanned(value);
          }}
        />
        <View style={[scannerFooterStyle, { backgroundColor: palette.cardBackgroundElevated }]}>
          <ThemedText style={[styles.hint, { color: palette.text }]}>{hint}</ThemedText>
          <Pressable
            style={[styles.cancelButton, { borderColor: palette.destructive }]}
            onPress={onClose}
          >
            <ThemedText style={[styles.cancelButtonText, { color: palette.destructive }]}>
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export async function requestQrCameraPermission(
  cameraPermission: { granted: boolean } | null,
  requestPermission: () => Promise<{ granted: boolean }>,
): Promise<boolean> {
  if (cameraPermission?.granted) return true;
  const result = await requestPermission();
  return result.granted;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 20,
    gap: Spacing.md,
  },
  hint: { fontSize: FontSizes.md },
  cancelButton: {
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: FontSizes.md, fontWeight: '600' },
});
