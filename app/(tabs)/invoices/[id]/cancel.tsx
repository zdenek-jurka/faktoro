import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { withOpacity } from '@/constants/theme';
import database from '@/db';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { InvoiceItemModel, InvoiceModel } from '@/model';
import {
  INVOICE_CANCELLATION_ALREADY_EXISTS_ERROR,
  INVOICE_CANCELLATION_INVALID_STATE_ERROR,
  INVOICE_CANCELLATION_REASON_REQUIRED_ERROR,
  cancelInvoice,
} from '@/repositories/invoice-repository';
import {
  canCancelIssuedInvoice,
  getRecommendedInvoiceCancellationMode,
  isInvoiceVatPayer,
  type InvoiceCancellationMode,
} from '@/utils/invoice-status';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

export default function InvoiceCancelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { LL } = useI18nContext();
  const palette = usePalette();

  const [invoice, setInvoice] = useState<InvoiceModel | null>(null);
  const [hasTimesheetItems, setHasTimesheetItems] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const invoiceSubscription = database
      .get<InvoiceModel>(InvoiceModel.table)
      .findAndObserve(id)
      .subscribe(setInvoice);

    const itemsSubscription = database
      .get<InvoiceItemModel>(InvoiceItemModel.table)
      .query(Q.where('invoice_id', id), Q.where('source_kind', 'timesheet'))
      .observeWithColumns(['invoice_id', 'source_kind'])
      .subscribe((items) => setHasTimesheetItems(items.length > 0));

    return () => {
      invoiceSubscription.unsubscribe();
      itemsSubscription.unsubscribe();
    };
  }, [id]);

  const recommendedMode = invoice
    ? getRecommendedInvoiceCancellationMode(invoice)
    : ('void_before_delivery' as InvoiceCancellationMode);
  const [mode, setMode] = useState<InvoiceCancellationMode>(recommendedMode);

  useEffect(() => {
    setMode(recommendedMode);
  }, [recommendedMode]);

  const vatPayerInvoice = isInvoiceVatPayer(invoice);
  const canCancel = invoice ? canCancelIssuedInvoice(invoice) : false;

  const modeOptions = useMemo(
    () => [
      {
        mode: 'void_before_delivery' as InvoiceCancellationMode,
        title: LL.invoices.cancelModeVoidTitle(),
        recommendation:
          recommendedMode === 'void_before_delivery'
            ? LL.invoices.cancelRecommendationVoid()
            : null,
        description: hasTimesheetItems
          ? LL.invoices.cancelModeVoidDescriptionWithTimesheets()
          : LL.invoices.cancelModeVoidDescription(),
      },
      {
        mode: 'issue_cancellation' as InvoiceCancellationMode,
        title: vatPayerInvoice
          ? LL.invoices.cancelModeCorrectionVatTitle()
          : LL.invoices.cancelModeCorrectionNonVatTitle(),
        recommendation:
          recommendedMode === 'issue_cancellation'
            ? LL.invoices.cancelRecommendationCorrection()
            : null,
        description: hasTimesheetItems
          ? vatPayerInvoice
            ? LL.invoices.cancelModeCorrectionVatDescriptionWithTimesheets()
            : LL.invoices.cancelModeCorrectionNonVatDescriptionWithTimesheets()
          : vatPayerInvoice
            ? LL.invoices.cancelModeCorrectionVatDescription()
            : LL.invoices.cancelModeCorrectionNonVatDescription(),
      },
    ],
    [LL, hasTimesheetItems, recommendedMode, vatPayerInvoice],
  );

  const selectedActionLabel =
    mode === 'void_before_delivery'
      ? LL.invoices.cancelConfirmVoid()
      : vatPayerInvoice
        ? LL.invoices.cancelConfirmCorrectionVat()
        : LL.invoices.cancelConfirmCorrectionNonVat();

  const getOverrideWarningMessage = () => {
    if (recommendedMode === 'issue_cancellation' && mode === 'void_before_delivery') {
      return LL.invoices.cancelOverrideVoidWarning();
    }
    if (recommendedMode === 'void_before_delivery' && mode === 'issue_cancellation') {
      return LL.invoices.cancelOverrideCorrectionWarning();
    }
    return null;
  };

  const performCancellation = async () => {
    if (!invoice) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      Alert.alert(LL.common.error(), LL.invoices.cancelReasonRequired());
      return;
    }

    setIsSubmitting(true);
    try {
      const resultInvoice = await cancelInvoice({
        id: invoice.id,
        mode,
        reason: trimmedReason,
      });

      if (mode === 'void_before_delivery') {
        Alert.alert(LL.common.success(), LL.invoices.cancelSuccessVoid(), [
          {
            text: LL.common.ok(),
            onPress: () => router.replace(`/invoices/${resultInvoice.id}`),
          },
        ]);
        return;
      }

      Alert.alert(
        LL.common.success(),
        LL.invoices.cancelSuccessCorrection({ invoiceNumber: resultInvoice.invoiceNumber }),
        [
          {
            text: LL.common.ok(),
            onPress: () => router.replace(`/invoices/${resultInvoice.id}`),
          },
        ],
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message === INVOICE_CANCELLATION_REASON_REQUIRED_ERROR
            ? LL.invoices.cancelReasonRequired()
            : error.message === INVOICE_CANCELLATION_INVALID_STATE_ERROR
              ? LL.invoices.cancelUnavailable()
              : error.message === INVOICE_CANCELLATION_ALREADY_EXISTS_ERROR
                ? LL.invoices.cancelAlreadyExists()
                : error.message
          : LL.invoices.cancelError();
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    const overrideWarning = getOverrideWarningMessage();
    if (!overrideWarning) {
      void performCancellation();
      return;
    }

    Alert.alert(LL.invoices.cancelOverrideWarningTitle(), overrideWarning, [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.continueAction(),
        onPress: () => {
          void performCancellation();
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.invoices.cancelScreenTitle() }} />
      <KeyboardAwareScroll
        contentContainerStyle={styles.content}
        enableAndroidKeyboardBottomPadding
      >
        {!invoice ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : (
          <>
            <View style={[styles.summaryCard, { backgroundColor: palette.cardBackground }]}>
              <ThemedText type="defaultSemiBold">{invoice.invoiceNumber}</ThemedText>
              <ThemedText>{LL.invoices.cancelModeSection()}</ThemedText>
              {!canCancel ? (
                <ThemedText style={styles.helperText}>{LL.invoices.cancelUnavailable()}</ThemedText>
              ) : null}
            </View>

            {modeOptions.map((option) => {
              const selected = mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  style={[
                    styles.modeCard,
                    {
                      backgroundColor: palette.cardBackground,
                      borderColor: selected ? palette.tint : palette.border,
                    },
                  ]}
                  onPress={() => setMode(option.mode)}
                  disabled={!canCancel || isSubmitting}
                >
                  <View style={styles.modeHeader}>
                    <ThemedText type="defaultSemiBold">{option.title}</ThemedText>
                    {option.recommendation ? (
                      <View
                        style={[
                          styles.recommendedBadge,
                          { backgroundColor: withOpacity(palette.tint, 0.14) },
                        ]}
                      >
                        <ThemedText style={[styles.recommendedBadgeText, { color: palette.tint }]}>
                          {LL.invoices.cancelRecommendedBadge()}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  {option.recommendation ? (
                    <ThemedText style={styles.modeRecommendation}>
                      {option.recommendation}
                    </ThemedText>
                  ) : null}
                  <ThemedText style={styles.modeDescription}>{option.description}</ThemedText>
                </Pressable>
              );
            })}

            <View style={[styles.reasonCard, { backgroundColor: palette.cardBackground }]}>
              <ThemedText type="defaultSemiBold">{LL.invoices.cancelReasonLabel()}</ThemedText>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={LL.invoices.cancelReasonPlaceholder()}
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.reasonInput,
                  {
                    borderColor: palette.border,
                    color: palette.text,
                    backgroundColor: palette.inputBackground,
                  },
                ]}
                multiline
                textAlignVertical="top"
                editable={!isSubmitting && canCancel}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.destructive,
                  opacity: !canCancel || isSubmitting || pressed ? 0.72 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={!canCancel || isSubmitting}
            >
              <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
                {isSubmitting ? LL.common.loading() : selectedActionLabel}
              </ThemedText>
            </Pressable>
          </>
        )}
      </KeyboardAwareScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 12 },
  loadingState: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  summaryCard: { borderRadius: 12, padding: 14, gap: 6 },
  helperText: { fontSize: 13, opacity: 0.75 },
  modeCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  recommendedBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  recommendedBadgeText: { fontSize: 11, fontWeight: '700' },
  modeRecommendation: { fontSize: 12, opacity: 0.8 },
  modeDescription: { fontSize: 13, lineHeight: 18, opacity: 0.85 },
  reasonCard: { borderRadius: 12, padding: 14, gap: 10 },
  reasonInput: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
});
