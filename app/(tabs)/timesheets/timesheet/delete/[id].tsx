import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { ClientModel, TimeEntryModel, TimesheetModel } from '@/model';
import {
  TIMESHEET_DELETE_LINKED_INVOICE_ERROR,
  type TimesheetDeletionContext,
  deleteTimesheet,
  getTimesheetDeletionContext,
} from '@/repositories/timesheet-repository';
import { getErrorMessage } from '@/utils/error-utils';
import { showConfirm } from '@/utils/platform-alert';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

function getTimesheetTitle(timesheet: TimesheetModel | null, fallbackTitle: string): string {
  if (!timesheet) return fallbackTitle;
  return timesheet.timesheetNumber?.trim() || timesheet.label?.trim() || fallbackTitle;
}

export default function TimesheetDeleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { LL, locale } = useI18nContext();
  const palette = usePalette();
  const contentContainerStyle = useBottomSafeAreaStyle(styles.content);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timesheet, setTimesheet] = useState<TimesheetModel | null>(null);
  const [client, setClient] = useState<ClientModel | null>(null);
  const [entriesCount, setEntriesCount] = useState(0);
  const [deletionContext, setDeletionContext] = useState<TimesheetDeletionContext | null>(null);

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const timesheetCollection = database.get<TimesheetModel>(TimesheetModel.table);
        const clientCollection = database.get<ClientModel>(ClientModel.table);
        const timeEntryCollection = database.get<TimeEntryModel>(TimeEntryModel.table);

        const loadedTimesheet = await timesheetCollection.find(id);
        const [linkedEntries, loadedDeletionContext] = await Promise.all([
          timeEntryCollection.query(Q.where('timesheet_id', id)).fetch(),
          getTimesheetDeletionContext(id),
        ]);

        let loadedClient: ClientModel | null = null;
        if (loadedTimesheet.clientId) {
          try {
            loadedClient = await clientCollection.find(loadedTimesheet.clientId);
          } catch {
            loadedClient = null;
          }
        }

        if (!isMounted) return;

        setTimesheet(loadedTimesheet);
        setClient(loadedClient);
        setEntriesCount(linkedEntries.length);
        setDeletionContext(loadedDeletionContext);
      } catch {
        if (!isMounted) return;
        setTimesheet(null);
        setClient(null);
        setEntriesCount(0);
        setDeletionContext(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const timesheetTitle = getTimesheetTitle(timesheet, LL.timesheets.detailTitle());
  const canDelete = deletionContext?.canDelete ?? false;
  const linkedInvoiceId = deletionContext?.linkedInvoiceId ?? null;
  const linkedInvoiceNumber = deletionContext?.linkedInvoiceNumber ?? null;
  const formattedPeriod = useMemo(() => {
    if (!timesheet) return '-';
    return `${new Date(timesheet.periodFrom).toLocaleDateString(locale)} - ${new Date(
      timesheet.periodTo,
    ).toLocaleDateString(locale)}`;
  }, [locale, timesheet]);

  const handleDeleteTimesheet = async () => {
    if (!timesheet || !canDelete) return;

    const confirmed = await showConfirm({
      title: LL.timesheets.deleteConfirmTitle(),
      message: LL.timesheets.deleteConfirmMessage(),
      confirmText: LL.timesheets.deleteConfirmAction(),
      cancelText: LL.common.cancel(),
      destructive: true,
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await deleteTimesheet(timesheet.id);
      Alert.alert(LL.common.success(), LL.timesheets.deleteSuccess(), [
        {
          text: LL.common.ok(),
          onPress: () => router.replace('/timesheets'),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === TIMESHEET_DELETE_LINKED_INVOICE_ERROR
          ? LL.timesheets.deleteBlockedByInvoice()
          : getErrorMessage(error, LL.timesheets.deleteError());
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenLinkedInvoice = () => {
    if (!linkedInvoiceId) return;

    router.push({
      pathname: '/invoices/[id]',
      params: { id: linkedInvoiceId },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.timesheets.deleteScreenTitle() }} />
      <ScrollView contentContainerStyle={contentContainerStyle}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.tint} />
          </View>
        ) : timesheet ? (
          <>
            <View style={[styles.summaryCard, { backgroundColor: palette.cardBackground }]}>
              <ThemedText type="defaultSemiBold" style={styles.summaryTitle}>
                {timesheetTitle}
              </ThemedText>
              <ThemedText style={styles.summaryMeta}>
                {LL.timesheets.clientLabel()}: {client?.name ?? '-'}
              </ThemedText>
              <ThemedText style={styles.summaryMeta}>
                {LL.timesheets.periodLabel()}: {formattedPeriod}
              </ThemedText>
              <ThemedText style={styles.summaryMeta}>
                {LL.timesheets.entriesCount({ count: entriesCount })}
              </ThemedText>
            </View>

            {canDelete ? (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor: palette.border,
                  },
                ]}
              >
                <ThemedText style={styles.infoText}>{LL.timesheets.deleteDescription()}</ThemedText>
              </View>
            ) : (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: palette.cardBackground,
                    borderColor: palette.destructive,
                  },
                ]}
              >
                <ThemedText style={styles.infoText}>
                  {LL.timesheets.deleteBlockedByInvoice()}
                </ThemedText>
                {linkedInvoiceNumber ? (
                  <ThemedText style={styles.infoSubtext}>
                    {LL.timesheets.deleteLinkedInvoiceDescription({
                      invoiceNumber: linkedInvoiceNumber,
                    })}
                  </ThemedText>
                ) : null}
                {linkedInvoiceId ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.linkButton,
                      {
                        backgroundColor: palette.buttonNeutralBackground,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                    onPress={handleOpenLinkedInvoice}
                    accessibilityRole="button"
                    accessibilityLabel={
                      linkedInvoiceNumber
                        ? LL.timesheets.deleteLinkedInvoiceDescription({
                            invoiceNumber: linkedInvoiceNumber,
                          })
                        : LL.timesheets.openLinkedInvoice()
                    }
                  >
                    <ThemedText style={[styles.linkButtonText, { color: palette.tint }]}>
                      {LL.timesheets.openLinkedInvoice()}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            )}

            {canDelete ? (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  {
                    backgroundColor: palette.destructive,
                    opacity: isSubmitting || pressed ? 0.72 : 1,
                  },
                ]}
                onPress={() => void handleDeleteTimesheet()}
                disabled={isSubmitting}
              >
                <ThemedText style={[styles.deleteButtonText, { color: palette.onDestructive }]}>
                  {isSubmitting ? LL.common.loading() : LL.timesheets.deleteConfirmAction()}
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={[styles.infoCard, { backgroundColor: palette.cardBackground }]}>
            <ThemedText style={styles.infoText}>{LL.timesheets.deleteError()}</ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  loadingState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  summaryTitle: {
    fontSize: 16,
  },
  summaryMeta: {
    fontSize: 13,
    opacity: 0.74,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoSubtext: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.78,
  },
  linkButton: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
