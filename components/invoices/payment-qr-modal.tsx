import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

type QrMatrix = {
  size: number;
  data: boolean[];
};

type PaymentQrModalProps = {
  visible: boolean;
  payload: string | null;
  qrTypeLabel: string;
  amountLabel: string;
  receiverName: string;
  reference: string;
  unavailableReason: string | null;
  fixLabel: string | null;
  onClose: () => void;
  onFix: () => void;
};

export function PaymentQrModal({
  visible,
  payload,
  qrTypeLabel,
  amountLabel,
  receiverName,
  reference,
  unavailableReason,
  fixLabel,
  onClose,
  onFix,
}: PaymentQrModalProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const sheetStyle = useBottomSafeAreaStyle(styles.sheet);
  const [qrMatrix, setQrMatrix] = useState<QrMatrix | null>(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!visible || !payload) {
      setQrMatrix(null);
      setRenderError(false);
      return;
    }

    let isMounted = true;
    setQrMatrix(null);
    setRenderError(false);

    const buildQr = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const QRCode = require('qrcode');
        const qr = QRCode.create(payload, {
          errorCorrectionLevel: 'M',
        });
        const sourceSize = qr.modules.size;
        const margin = 4;
        const size = sourceSize + margin * 2;
        const data = Array.from({ length: size * size }, (_, index) => {
          const row = Math.floor(index / size) - margin;
          const column = (index % size) - margin;
          if (row < 0 || column < 0 || row >= sourceSize || column >= sourceSize) {
            return false;
          }
          return !!qr.modules.data[row * sourceSize + column];
        });
        if (isMounted) {
          setQrMatrix({ size, data });
        }
      } catch {
        if (isMounted) {
          setRenderError(true);
        }
      }
    };

    void buildQr();

    return () => {
      isMounted = false;
    };
  }, [payload, visible]);

  const copyPayload = async () => {
    if (!payload) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(payload);
      Alert.alert(LL.common.success(), LL.invoices.paymentQrCopySuccess());
    } catch {
      Alert.alert(LL.common.error(), LL.invoices.paymentQrCopyError());
    }
  };

  const showUnavailable = !payload || !!unavailableReason || renderError;
  const unavailableMessage =
    unavailableReason || (renderError ? LL.invoices.paymentQrRenderError() : null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: palette.overlayBackdrop }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={LL.invoices.paymentQrClose()}
        />
        <ThemedView style={[sheetStyle, { backgroundColor: palette.background }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText type="subtitle">{LL.invoices.paymentQrTitle()}</ThemedText>
                <ThemedText style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {qrTypeLabel}
                </ThemedText>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={LL.invoices.paymentQrClose()}
                hitSlop={8}
              >
                <IconSymbol name="xmark" size={22} color={palette.text} />
              </Pressable>
            </View>

            {showUnavailable ? (
              <View
                style={[
                  styles.warningBox,
                  {
                    backgroundColor: withOpacity(palette.timerPause, 0.12),
                    borderColor: withOpacity(palette.timerPause, 0.28),
                  },
                ]}
              >
                <IconSymbol
                  name="exclamationmark.triangle.fill"
                  size={22}
                  color={palette.timerPause}
                />
                <View style={styles.warningContent}>
                  <ThemedText style={[styles.warningTitle, { color: palette.timerPause }]}>
                    {LL.invoices.paymentQrUnavailableTitle()}
                  </ThemedText>
                  {unavailableMessage ? (
                    <ThemedText style={[styles.warningText, { color: palette.text }]}>
                      {unavailableMessage}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.qrFrame,
                    {
                      backgroundColor: palette.qrCodeBackground,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  {qrMatrix ? (
                    <PaymentQrMatrix matrix={qrMatrix} />
                  ) : (
                    <ThemedText style={[styles.loadingText, { color: palette.textSecondary }]}>
                      {LL.common.loading()}
                    </ThemedText>
                  )}
                </View>

                <View style={styles.details}>
                  <PaymentQrDetailRow label={LL.invoices.paymentQrAmount()} value={amountLabel} />
                  <PaymentQrDetailRow
                    label={LL.invoices.paymentQrReceiver()}
                    value={receiverName || '-'}
                  />
                  <PaymentQrDetailRow
                    label={LL.invoices.paymentQrReference()}
                    value={reference || '-'}
                  />
                </View>
              </>
            )}

            <View style={styles.actions}>
              {payload && !showUnavailable ? (
                <Pressable
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: palette.buttonNeutralBackground,
                    },
                  ]}
                  onPress={() => void copyPayload()}
                  accessibilityRole="button"
                  accessibilityLabel={LL.invoices.paymentQrCopyPayload()}
                >
                  <IconSymbol name="doc.on.doc" size={18} color={palette.textMuted} />
                  <ThemedText style={[styles.secondaryActionText, { color: palette.textMuted }]}>
                    {LL.invoices.paymentQrCopyPayload()}
                  </ThemedText>
                </Pressable>
              ) : null}
              {showUnavailable && fixLabel ? (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: palette.tint }]}
                  onPress={onFix}
                  accessibilityRole="button"
                  accessibilityLabel={fixLabel}
                >
                  <ThemedText style={[styles.primaryActionText, { color: palette.onTint }]}>
                    {fixLabel}
                  </ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: showUnavailable
                      ? palette.buttonNeutralBackground
                      : palette.tint,
                  },
                ]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={LL.invoices.paymentQrClose()}
              >
                <ThemedText
                  style={[
                    showUnavailable ? styles.secondaryActionText : styles.primaryActionText,
                    { color: showUnavailable ? palette.textMuted : palette.onTint },
                  ]}
                >
                  {LL.invoices.paymentQrClose()}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

function PaymentQrDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText style={styles.detailLabel}>{label}</ThemedText>
      <ThemedText style={styles.detailValue}>{value}</ThemedText>
    </View>
  );
}

function PaymentQrMatrix({ matrix }: { matrix: QrMatrix }) {
  return (
    <View style={styles.qrMatrix}>
      {Array.from({ length: matrix.size }, (_, row) => (
        <View key={row} style={styles.qrRow}>
          {Array.from({ length: matrix.size }, (_, column) => {
            const filled = matrix.data[row * matrix.size + column];
            return <View key={column} style={[styles.qrCell, filled ? styles.qrCellDark : null]} />;
          })}
        </View>
      ))}
    </View>
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '86%',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  qrFrame: {
    alignSelf: 'center',
    width: 244,
    height: 244,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  qrMatrix: {
    width: '100%',
    height: '100%',
  },
  qrRow: {
    flex: 1,
    flexDirection: 'row',
  },
  qrCell: {
    flex: 1,
    backgroundColor: '#fff',
  },
  qrCellDark: {
    backgroundColor: '#000',
  },
  loadingText: {
    fontSize: 13,
  },
  warningBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
  },
  warningContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  details: {
    marginTop: 16,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    width: 92,
    fontSize: 12,
    opacity: 0.64,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    marginTop: 18,
    gap: 10,
  },
  actionButton: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
