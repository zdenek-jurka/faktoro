import { LabeledAutoGrowTextArea } from '@/components/ui/labeled-auto-grow-textarea';
import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, withOpacity } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, PriceListItemModel } from '@/model';
import { getEffectivePriceDetails } from '@/repositories/client-price-override-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Pressable, View } from 'react-native';

type TimeEntryFormMode = 'create' | 'edit';

type TimeEntryFormModalProps = {
  visible: boolean;
  mode: TimeEntryFormMode;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  clients: ClientModel[];
  selectedClientId?: string;
  onClientChange?: (clientId: string) => void;
  fixedClientName?: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  priceListItems: PriceListItemModel[];
  selectedPriceListItemId: string;
  onPriceListItemChange: (priceListItemId: string) => void;
  disableSubmit?: boolean;
};

export function TimeEntryFormModal({
  visible,
  mode,
  title,
  submitLabel,
  onClose,
  onSubmit,
  clients,
  selectedClientId,
  onClientChange,
  fixedClientName,
  description,
  onDescriptionChange,
  priceListItems,
  selectedPriceListItemId,
  onPriceListItemChange,
  disableSubmit = false,
}: TimeEntryFormModalProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL, locale } = useI18nContext();
  const modalContentStyle = useBottomSafeAreaStyle(styles.modalContent);
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const intlLocale = normalizeIntlLocale(locale, 'en');

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  const showClientField = mode === 'create' || !!fixedClientName;
  const [effectiveRate, setEffectiveRate] = useState<{ price: number; currency: string } | null>(
    null,
  );
  const [isRateLoading, setIsRateLoading] = useState(false);

  const selectedPriceListItem = useMemo(
    () => priceListItems.find((item) => item.id === selectedPriceListItemId),
    [priceListItems, selectedPriceListItemId],
  );
  const selectedClientName = useMemo(
    () => clients.find((client) => client.id === selectedClientId)?.name?.trim() || '',
    [clients, selectedClientId],
  );

  useEffect(() => {
    let isMounted = true;

    const loadRate = async () => {
      if (!selectedClientId || !selectedPriceListItemId) {
        if (isMounted) {
          setEffectiveRate(null);
          setIsRateLoading(false);
        }
        return;
      }

      setIsRateLoading(true);
      try {
        const rate = await getEffectivePriceDetails(selectedClientId, selectedPriceListItemId);
        if (isMounted) setEffectiveRate(rate);
      } catch {
        if (isMounted) setEffectiveRate(null);
      } finally {
        if (isMounted) setIsRateLoading(false);
      }
    };

    loadRate();
    return () => {
      isMounted = false;
    };
  }, [selectedClientId, selectedPriceListItemId]);

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdrop }]}
        behavior={isIos ? 'padding' : 'height'}
        keyboardVerticalOffset={isIos ? 24 : 0}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <ThemedView style={modalContentStyle}>
          <ScrollView
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {title}
            </ThemedText>

            {showClientField && (
              <>
                <ThemedText style={styles.label}>{LL.timeTracking.client()}</ThemedText>
                {fixedClientName ? (
                  <ThemedView
                    style={[
                      styles.clientDisplay,
                      {
                        borderColor: palette.timeHighlight,
                        backgroundColor:
                          colorScheme === 'dark'
                            ? withOpacity(palette.timeHighlight, 0.2)
                            : withOpacity(palette.timeHighlight, 0.1),
                      },
                    ]}
                  >
                    <ThemedText
                      style={[styles.clientDisplayText, { color: palette.timeHighlight }]}
                    >
                      {fixedClientName}
                    </ThemedText>
                  </ThemedView>
                ) : clients.length === 0 ? (
                  <NoClientsRequiredNotice
                    message={LL.timeTracking.addClientFirst()}
                    style={styles.notice}
                  />
                ) : (
                  <EntityPickerField
                    value={selectedClientId ?? ''}
                    onValueChange={(value) => onClientChange?.(value)}
                    title={LL.timeTracking.client()}
                    placeholder={selectedClientName || LL.clients.selectClient()}
                    searchPlaceholder={LL.clients.searchPlaceholder()}
                    emptyText={LL.clients.noClients()}
                    emptySearchText={LL.clients.noClientsSearch()}
                    options={clients.map((client) => ({
                      value: client.id,
                      label: client.name,
                    }))}
                  />
                )}
              </>
            )}

            <LabeledAutoGrowTextArea
              label={LL.timeTracking.activity()}
              value={description}
              onChangeText={onDescriptionChange}
              placeholder={LL.timeTracking.activityPlaceholder()}
            />

            {priceListItems.length > 0 && (
              <>
                <ThemedText style={styles.label}>{LL.timeTracking.priceListItem()}</ThemedText>
                <EntityPickerField
                  value={selectedPriceListItemId}
                  onValueChange={onPriceListItemChange}
                  title={LL.timeTracking.priceListItem()}
                  placeholder={selectedPriceListItem?.name || LL.timeTracking.priceListItem()}
                  searchPlaceholder={LL.priceList.searchPlaceholder()}
                  emptyText={LL.priceList.noItems()}
                  emptySearchText={LL.priceList.noItemsSearch()}
                  noneOption={{
                    value: '',
                    label: LL.timeTracking.noPriceListLink(),
                  }}
                  options={priceListItems.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
                {!!selectedPriceListItemId && selectedPriceListItem && (
                  <ThemedText style={styles.effectiveRateText}>
                    {isRateLoading
                      ? '...'
                      : `${formatPrice(
                          effectiveRate?.price ?? selectedPriceListItem.defaultPrice,
                          effectiveRate?.currency ||
                            normalizeCurrencyCode(
                              selectedPriceListItem.defaultPriceCurrency,
                              defaultInvoiceCurrency,
                            ),
                          intlLocale,
                        )} / ${getUnitLabel(selectedPriceListItem.unit)}`}
                  </ThemedText>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.modalButtons}>
            <Pressable
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: palette.buttonNeutralBackground },
              ]}
              onPress={onClose}
            >
              <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                {LL.common.cancel()}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: disableSubmit ? palette.borderStrong : palette.tint,
                },
              ]}
              onPress={onSubmit}
              disabled={disableSubmit}
            >
              <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                {submitLabel}
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '92%',
    maxWidth: 460,
    maxHeight: '88%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  notice: {
    marginTop: 4,
    marginBottom: 4,
  },
  clientDisplay: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  clientDisplayText: {
    fontSize: 16,
    fontWeight: '600',
  },
  effectiveRateText: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.7,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  confirmButton: {
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
