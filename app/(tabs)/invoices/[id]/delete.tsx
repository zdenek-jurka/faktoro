import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import database from '@/db';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { InvoiceItemModel, InvoiceModel } from '@/model';
import {
  INVOICE_DELETE_INVALID_STATE_ERROR,
  deleteInvoice,
} from '@/repositories/invoice-repository';
import { getAppLockConfirmationState } from '@/utils/app-lock-confirmation';
import { getErrorMessage } from '@/utils/error-utils';
import { canDeleteInvoice } from '@/utils/invoice-status';
import { showConfirm } from '@/utils/platform-alert';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

export default function InvoiceDeleteScreen() {
  const { id, authConfirmed } = useLocalSearchParams<{ id: string; authConfirmed?: string }>();
  const router = useRouter();
  const { LL } = useI18nContext();
  const palette = usePalette();

  const [invoice, setInvoice] = useState<InvoiceModel | null>(null);
  const [hasTimesheetItems, setHasTimesheetItems] = useState(false);
  const [isCheckingSecurity, setIsCheckingSecurity] = useState(false);
  const [isSecurityConfirmed, setIsSecurityConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasHandledAuthConfirmationRef = useRef(false);

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

  const canDelete = invoice ? canDeleteInvoice(invoice) : false;
  const canPressDelete = canDelete && !isSubmitting && !isCheckingSecurity;

  const confirmAndDeleteInvoice = useCallback(async (): Promise<void> => {
    if (!invoice || !canDelete) return;

    const confirmMessage = [
      invoice.lastExportedAt
        ? LL.invoices.deleteConfirmExportedMessage()
        : LL.invoices.deleteConfirmMessage(),
      ...(hasTimesheetItems ? [LL.invoices.deleteConfirmTimesheetMessage()] : []),
    ].join('\n\n');

    const confirmed = await showConfirm({
      title: LL.invoices.deleteConfirmTitle(),
      message: confirmMessage,
      confirmText: LL.invoices.deleteConfirmAction(),
      cancelText: LL.common.cancel(),
      destructive: true,
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await deleteInvoice(invoice.id);
      Alert.alert(LL.common.success(), LL.invoices.deleteSuccess(), [
        {
          text: LL.common.ok(),
          onPress: () => router.replace('/invoices'),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === INVOICE_DELETE_INVALID_STATE_ERROR
          ? LL.invoices.deleteUnavailable()
          : getErrorMessage(error, LL.invoices.deleteError());
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsSubmitting(false);
    }
  }, [LL.common, LL.invoices, canDelete, hasTimesheetItems, invoice, router]);

  useEffect(() => {
    if (authConfirmed !== '1') return;
    if (!invoice || !canDelete) return;
    if (hasHandledAuthConfirmationRef.current) return;

    hasHandledAuthConfirmationRef.current = true;
    setIsSecurityConfirmed(true);
    void confirmAndDeleteInvoice();
  }, [authConfirmed, canDelete, confirmAndDeleteInvoice, invoice]);

  const descriptionLines = useMemo(() => {
    const lines: string[] = [];
    if (!invoice) {
      return lines;
    }

    lines.push(
      invoice.lastExportedAt
        ? LL.invoices.deleteExportedDescription()
        : LL.invoices.deleteDescription(),
    );

    if (hasTimesheetItems) {
      lines.push(LL.invoices.deleteTimesheetDescription());
    }

    return lines;
  }, [LL.invoices, hasTimesheetItems, invoice]);

  const handleDeleteInvoice = async () => {
    if (!invoice || !canDelete) return;

    try {
      if (!isSecurityConfirmed) {
        setIsCheckingSecurity(true);
        const state = await getAppLockConfirmationState({
          notAvailable: LL.settings.securityBiometricNotAvailableLabel(),
          faceId: LL.settings.securityBiometricFaceId(),
          touchId: LL.settings.securityBiometricTouchId(),
          biometrics: LL.settings.securityBiometricGenericLabel(),
        });

        if (state.requiresConfirmation) {
          router.push({
            pathname: '/invoices/[id]/delete-auth',
            params: {
              id: invoice.id,
              biometricEnabled: state.biometricEnabled ? '1' : '0',
              biometricLabel: state.biometricState.label,
            },
          });
          return;
        }

        setIsSecurityConfirmed(true);
      }

      await confirmAndDeleteInvoice();
    } finally {
      setIsCheckingSecurity(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.invoices.deleteScreenTitle() }} />
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
              {!canDelete ? (
                <ThemedText style={styles.helperText}>{LL.invoices.deleteUnavailable()}</ThemedText>
              ) : null}
            </View>

            {descriptionLines.map((line, index) => (
              <View
                key={`${index}-${line}`}
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor:
                      invoice.lastExportedAt || hasTimesheetItems
                        ? palette.destructive
                        : palette.border,
                  },
                ]}
              >
                <ThemedText style={styles.infoText}>{line}</ThemedText>
              </View>
            ))}

            {isSecurityConfirmed ? (
              <View
                style={[
                  styles.securityConfirmedCard,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor: palette.success,
                  },
                ]}
              >
                <ThemedText style={[styles.securityConfirmedText, { color: palette.success }]}>
                  {LL.invoices.deleteAppLockConfirmed()}
                </ThemedText>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.destructive,
                  opacity: !canPressDelete || pressed ? 0.72 : 1,
                },
              ]}
              onPress={() => void handleDeleteInvoice()}
              disabled={!canPressDelete}
            >
              <ThemedText style={[styles.primaryButtonText, { color: palette.onTint }]}>
                {isSubmitting || isCheckingSecurity
                  ? LL.common.loading()
                  : LL.invoices.deleteConfirmAction()}
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
  helperText: { fontSize: 13, opacity: 0.78 },
  infoCard: { borderRadius: 12, borderWidth: 1, padding: 14 },
  infoText: { fontSize: 13, lineHeight: 18, opacity: 0.9 },
  securityConfirmedCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  securityConfirmedText: { fontSize: 13, fontWeight: '600' },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
});
