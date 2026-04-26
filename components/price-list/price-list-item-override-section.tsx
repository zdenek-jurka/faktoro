import { ThemedText } from '@/components/themed-text';
import { NoClientsRequiredNotice } from '@/components/clients/no-clients-required-notice';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { SwipeableList } from '@/components/ui/swipeable-list';
import { usePalette } from '@/hooks/use-palette';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, ClientPriceOverrideModel, PriceListItemModel } from '@/model';
import {
  createClientPriceOverride,
  deleteClientPriceOverride,
  getPriceListItemOverrides,
  updateClientPriceOverride,
} from '@/repositories/client-price-override-repository';
import { getClients } from '@/repositories/client-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice, isValidPrice, parsePrice } from '@/utils/price-utils';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheetFormModal } from '@/components/ui/bottom-sheet-form-modal';

interface PriceListItemOverrideSectionProps {
  priceListItem: PriceListItemModel;
}

type OverrideFormData = {
  clientId: string;
  customPrice: string;
};

const EMPTY_FORM: OverrideFormData = {
  clientId: '',
  customPrice: '',
};

export function PriceListItemOverrideSection({ priceListItem }: PriceListItemOverrideSectionProps) {
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const [overrides, setOverrides] = useState<ClientPriceOverrideModel[]>([]);
  const [clients, setClients] = useState<ClientModel[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formData, setFormData] = useState<OverrideFormData>(EMPTY_FORM);
  const [customPriceSelection, setCustomPriceSelection] = useState<{
    start: number;
    end: number;
  }>();
  const customPriceInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const subscription = getPriceListItemOverrides(priceListItem.id)
      .observeWithColumns(['client_id', 'custom_price', 'custom_price_currency'])
      .subscribe(setOverrides);
    return () => subscription.unsubscribe();
  }, [priceListItem.id]);

  useEffect(() => {
    const subscription = getClients(false).observeWithColumns(['name']).subscribe(setClients);
    return () => subscription.unsubscribe();
  }, []);

  const getClientName = (clientId: string): string => {
    const client = clients.find((c) => c.id === clientId);
    return client?.name || '';
  };

  const handleAdd = () => {
    if (clients.length === 0) {
      Alert.alert(LL.common.error(), LL.timeTracking.addClientFirst());
      return;
    }
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setModalVisible(true);
  };

  const handleEdit = async (override: ClientPriceOverrideModel) => {
    setEditingId(override.id);
    setFormData({
      clientId: override.clientId,
      customPrice: override.customPrice.toString(),
    });
    setModalVisible(true);
  };

  const handleDelete = async (override: ClientPriceOverrideModel) => {
    const clientName = getClientName(override.clientId);
    Alert.alert(
      LL.priceList.deleteOverride(),
      LL.priceList.deleteOverrideMessage({ client: clientName }),
      [
        { text: LL.common.cancel(), style: 'cancel' },
        {
          text: LL.common.delete(),
          style: 'destructive',
          onPress: async () => {
            await deleteClientPriceOverride(override.id);
          },
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.customPrice.trim()) {
      Alert.alert(LL.common.error(), LL.priceList.errorRequiredFields());
      return;
    }

    if (!isValidPrice(formData.customPrice)) {
      Alert.alert(LL.common.error(), LL.priceList.errorInvalidPrice());
      return;
    }
    const price = parsePrice(formData.customPrice);

    try {
      if (editingId) {
        await updateClientPriceOverride({
          id: editingId,
          customPrice: price,
        });
      } else {
        // Check if override already exists for this client
        const existingOverride = overrides.find((o) => o.clientId === formData.clientId);
        if (existingOverride) {
          Alert.alert(LL.common.error(), LL.priceList.errorOverrideExists());
          return;
        }

        await createClientPriceOverride({
          clientId: formData.clientId,
          priceListItemId: priceListItem.id,
          customPrice: price,
          customPriceCurrency: priceListItem.defaultPriceCurrency,
        });
      }
      setModalVisible(false);
    } catch (error) {
      console.error('Error saving override:', error);
      Alert.alert(LL.common.error(), LL.common.error());
    }
  };

  const handleCancel = () => {
    setModalVisible(false);
    setPickerOpen(false);
    setCustomPriceSelection(undefined);
  };

  const focusCustomPriceInput = (priceValue: string) => {
    InteractionManager.runAfterInteractions(() => {
      customPriceInputRef.current?.focus();
      setCustomPriceSelection({ start: 0, end: priceValue.length });
    });
  };

  const renderOverrideItem = (override: ClientPriceOverrideModel, index: number): ReactNode => {
    const clientName = getClientName(override.clientId);
    return (
      <View style={styles.overrideItem}>
        <View style={styles.overrideInfo}>
          <ThemedText style={styles.clientName}>{clientName}</ThemedText>
          <ThemedText style={styles.customPrice}>
            {formatPrice(
              override.customPrice,
              normalizeCurrencyCode(override.customPriceCurrency, defaultInvoiceCurrency),
              intlLocale,
            )}
          </ThemedText>
        </View>
      </View>
    );
  };

  // Get available clients (exclude those with existing overrides)
  const availableClients = clients.filter(
    (client) => !overrides.some((o) => o.clientId === client.id),
  );

  return (
    <>
      <SwipeableList
        iconName="person.badge.plus"
        title={LL.priceList.clientOverrides()}
        items={overrides}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onEdit={handleEdit}
        keyExtractor={(item) => item.id}
        renderItem={renderOverrideItem}
        emptyText={
          clients.length > 0 ? LL.priceList.noClientOverrides() : LL.timeTracking.addClientFirst()
        }
        itemBackgroundColor={palette.cardBackground}
        showAddButton={clients.length > 0 && availableClients.length > 0}
      />
      {clients.length === 0 && (
        <NoClientsRequiredNotice
          message={LL.timeTracking.addClientFirst()}
          returnTo="priceListItem"
          returnToId={priceListItem.id}
          style={styles.notice}
        />
      )}

      <BottomSheetFormModal
        visible={modalVisible}
        onClose={handleCancel}
        onSave={handleSubmit}
        title={editingId ? LL.priceList.editOverride() : LL.priceList.addOverride()}
        keyboardAvoidanceEnabled={!pickerOpen}
      >
        {editingId ? (
          <View style={[styles.editingClientInfo, { backgroundColor: palette.cardBackground }]}>
            <ThemedText style={styles.editingClientName}>
              {getClientName(formData.clientId)}
            </ThemedText>
          </View>
        ) : (
          <>
            <ThemedText style={styles.label}>{LL.clients.title()} *</ThemedText>
            <EntityPickerField
              value={formData.clientId}
              onOpenChange={setPickerOpen}
              onValueChange={(clientId) => {
                const nextCustomPrice =
                  formData.customPrice || priceListItem.defaultPrice.toString();
                setFormData({
                  ...formData,
                  clientId,
                  customPrice: nextCustomPrice,
                });
                focusCustomPriceInput(nextCustomPrice);
              }}
              title={LL.clients.title()}
              placeholder={LL.clients.selectClient()}
              searchPlaceholder={LL.clients.searchPlaceholder()}
              emptyText={LL.clients.noClients()}
              emptySearchText={LL.clients.noClientsSearch()}
              options={availableClients.map((client) => ({
                value: client.id,
                label: client.name,
              }))}
            />
          </>
        )}

        <ThemedText style={styles.label}>{LL.priceList.customPrice()} *</ThemedText>
        <TextInput
          ref={customPriceInputRef}
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: palette.inputBorder,
            },
          ]}
          placeholder="0.00"
          placeholderTextColor={palette.placeholder}
          value={formData.customPrice}
          onChangeText={(text) => {
            setCustomPriceSelection(undefined);
            setFormData({ ...formData, customPrice: text });
          }}
          onSelectionChange={(event) => setCustomPriceSelection(event.nativeEvent.selection)}
          selection={customPriceSelection}
          selectTextOnFocus
          keyboardType="decimal-pad"
        />

        <View style={[styles.defaultPriceInfo, { backgroundColor: palette.cardBackground }]}>
          <ThemedText style={styles.defaultPriceLabel}>{LL.priceList.defaultLabel()}</ThemedText>
          <ThemedText style={styles.defaultPriceValue}>
            {formatPrice(
              priceListItem.defaultPrice,
              normalizeCurrencyCode(priceListItem.defaultPriceCurrency, defaultInvoiceCurrency),
              intlLocale,
            )}
          </ThemedText>
        </View>

        <ThemedText style={styles.defaultPriceLabel}>
          {LL.priceList.currencyInherited({
            currency: normalizeCurrencyCode(
              priceListItem.defaultPriceCurrency,
              defaultInvoiceCurrency,
            ),
          })}
        </ThemedText>
      </BottomSheetFormModal>
    </>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: 10,
  },
  overrideItem: {
    paddingVertical: 8,
  },
  overrideInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
  },
  customPrice: {
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  editingClientInfo: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  editingClientName: {
    fontSize: 18,
    fontWeight: '600',
  },
  defaultPriceInfo: {
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  defaultPriceLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  defaultPriceValue: {
    fontSize: 16,
    fontWeight: '600',
  },
});
