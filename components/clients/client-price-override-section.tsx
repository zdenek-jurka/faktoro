import React, { useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BottomSheetFormModal } from '@/components/ui/bottom-sheet-form-modal';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { SwipeableList } from '@/components/ui/swipeable-list';
import { Colors, FontSizes, Opacity, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, ClientPriceOverrideModel, PriceListItemModel } from '@/model';
import {
  createClientPriceOverride,
  deleteClientPriceOverride,
  getClientPriceOverrides,
  updateClientPriceOverride,
} from '@/repositories/client-price-override-repository';
import { getPriceListItems } from '@/repositories/price-list-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice, isValidPrice, parsePrice } from '@/utils/price-utils';

interface ClientPriceOverrideSectionProps {
  client: ClientModel;
}

type OverrideFormData = {
  priceListItemId: string;
  customPrice: string;
};

const EMPTY_FORM: OverrideFormData = {
  priceListItemId: '',
  customPrice: '',
};

export function ClientPriceOverrideSection({ client }: ClientPriceOverrideSectionProps) {
  const colorScheme = useColorScheme();
  const { LL, locale } = useI18nContext();
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const [priceListItems, setPriceListItems] = useState<PriceListItemModel[]>([]);
  const [overrides, setOverrides] = useState<ClientPriceOverrideModel[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<OverrideFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customPriceSelection, setCustomPriceSelection] = useState<{
    start: number;
    end: number;
  }>();
  const customPriceInputRef = useRef<TextInput>(null);

  // Load price list items
  useEffect(() => {
    const subscription = getPriceListItems(false).observe().subscribe(setPriceListItems);
    return () => subscription.unsubscribe();
  }, []);

  // Load client price overrides
  useEffect(() => {
    const subscription = getClientPriceOverrides(client.id).observe().subscribe(setOverrides);
    return () => subscription.unsubscribe();
  }, [client.id]);

  const handleOpenModal = (override?: ClientPriceOverrideModel) => {
    if (override) {
      setEditingId(override.id);
      setFormData({
        priceListItemId: override.priceListItemId,
        customPrice: override.customPrice?.toString() || '',
      });
    } else {
      setEditingId(null);
      setFormData(EMPTY_FORM);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setCustomPriceSelection(undefined);
  };

  const focusCustomPriceInput = (priceValue: string) => {
    InteractionManager.runAfterInteractions(() => {
      customPriceInputRef.current?.focus();
      setCustomPriceSelection({ start: 0, end: priceValue.length });
    });
  };

  const handleSubmit = async () => {
    if (!formData.priceListItemId) {
      Alert.alert(LL.common.error(), LL.priceList.errorRequiredFields());
      return;
    }

    if (!isValidPrice(formData.customPrice)) {
      Alert.alert(LL.common.error(), LL.priceList.errorInvalidPrice());
      return;
    }

    const customPrice = parsePrice(formData.customPrice);

    try {
      if (editingId) {
        await updateClientPriceOverride({
          id: editingId,
          customPrice,
        });
      } else {
        await createClientPriceOverride({
          clientId: client.id,
          priceListItemId: formData.priceListItemId,
          customPrice,
          customPriceCurrency: selectedAvailableItem?.defaultPriceCurrency,
        });
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving price override:', error);
      Alert.alert(LL.common.error(), LL.common.error());
    }
  };

  const handleDelete = (overrideId: string) => {
    Alert.alert(LL.priceList.clearOverride(), LL.clients.deleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: () => deleteClientPriceOverride(overrideId),
      },
    ]);
  };

  const getPriceListItem = (itemId: string): PriceListItemModel | undefined => {
    return priceListItems.find((item) => item.id === itemId);
  };

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  // Get items that don't have overrides yet (for the add modal)
  const availableItems = editingId
    ? priceListItems
    : priceListItems.filter(
        (item) => !overrides.some((override) => override.priceListItemId === item.id),
      );
  const selectedAvailableItem = availableItems.find((item) => item.id === formData.priceListItemId);
  const requiredPriceListItemLabel = LL.priceList.selectItem().replace(/\s*\([^)]*\)\s*$/, '');

  return (
    <View style={styles.section}>
      <SwipeableList
        iconName="tag.fill"
        title={LL.priceList.priceOverrides()}
        items={overrides}
        onAdd={() => handleOpenModal()}
        onDelete={(override: ClientPriceOverrideModel) => handleDelete(override.id)}
        onEdit={(override: ClientPriceOverrideModel) => handleOpenModal(override)}
        keyExtractor={(override: ClientPriceOverrideModel) => override.id}
        renderItem={(override: ClientPriceOverrideModel) => {
          const item = getPriceListItem(override.priceListItemId);
          if (!item) return null;

          return (
            <View style={styles.overrideContent}>
              <View style={styles.itemHeader}>
                <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                <ThemedText style={styles.unitLabel}>({getUnitLabel(item.unit)})</ThemedText>
              </View>
              <View style={styles.twoColumnRow}>
                <View style={styles.column}>
                  <View style={styles.detailTextContainer}>
                    <ThemedText style={styles.detailValue}>
                      {formatPrice(
                        item.defaultPrice,
                        normalizeCurrencyCode(item.defaultPriceCurrency, defaultInvoiceCurrency),
                        intlLocale,
                      )}
                    </ThemedText>
                    <ThemedText style={styles.detailLabel}>
                      {LL.priceList.defaultLabel()}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.column}>
                  <View style={styles.detailTextContainer}>
                    <ThemedText
                      style={[
                        styles.detailValue,
                        styles.textRight,
                        styles.customPriceValue,
                        { color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].timeHighlight },
                      ]}
                    >
                      {formatPrice(
                        override.customPrice,
                        normalizeCurrencyCode(override.customPriceCurrency, defaultInvoiceCurrency),
                        intlLocale,
                      )}
                    </ThemedText>
                    <ThemedText style={[styles.detailLabel, styles.textRight]}>
                      {LL.priceList.customLabel()}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        emptyText={LL.priceList.noOverride()}
        itemBackgroundColor={Colors[colorScheme === 'dark' ? 'dark' : 'light'].cardBackground}
      />

      <BottomSheetFormModal
        visible={showModal}
        onClose={handleCloseModal}
        onSave={handleSubmit}
        title={LL.priceList.setOverride()}
      >
        {editingId && formData.priceListItemId && (
          <View
            style={[
              styles.editingItemInfo,
              {
                backgroundColor:
                  Colors[colorScheme === 'dark' ? 'dark' : 'light'].buttonNeutralBackground,
              },
            ]}
          >
            {(() => {
              const item = getPriceListItem(formData.priceListItemId);
              if (!item) return null;
              return (
                <>
                  <View style={styles.editingItemHeader}>
                    <ThemedText style={styles.editingItemName}>{item.name}</ThemedText>
                    <ThemedText style={styles.editingItemUnit}>
                      ({getUnitLabel(item.unit)})
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.editingItemPrice}>
                    {formatPrice(
                      item.defaultPrice,
                      normalizeCurrencyCode(item.defaultPriceCurrency, defaultInvoiceCurrency),
                      intlLocale,
                    )}
                  </ThemedText>
                </>
              );
            })()}
          </View>
        )}

        {!editingId && (
          <>
            <ThemedText style={styles.label}>{requiredPriceListItemLabel} *</ThemedText>
            {availableItems.length === 0 ? (
              <ThemedText style={styles.noItemsText}>{LL.priceList.noItems()}</ThemedText>
            ) : (
              <EntityPickerField
                value={formData.priceListItemId}
                onValueChange={(priceListItemId) => {
                  const selectedItem = availableItems.find((item) => item.id === priceListItemId);
                  const nextCustomPrice =
                    formData.customPrice || selectedItem?.defaultPrice.toString() || '';
                  setFormData({
                    ...formData,
                    priceListItemId,
                    customPrice: nextCustomPrice,
                  });
                  focusCustomPriceInput(nextCustomPrice);
                }}
                title={LL.priceList.title()}
                placeholder={selectedAvailableItem?.name || requiredPriceListItemLabel}
                searchPlaceholder={LL.priceList.searchPlaceholder()}
                emptyText={LL.priceList.noItems()}
                emptySearchText={LL.priceList.noItemsSearch()}
                options={availableItems.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            )}
          </>
        )}

        <ThemedText style={styles.label}>{LL.priceList.customPrice()} *</ThemedText>
        <TextInput
          ref={customPriceInputRef}
          style={[
            styles.input,
            {
              color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].text,
              borderColor: Colors[colorScheme === 'dark' ? 'dark' : 'light'].inputBorder,
            },
          ]}
          placeholder="0.00"
          placeholderTextColor={Colors[colorScheme === 'dark' ? 'dark' : 'light'].placeholder}
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

        {selectedAvailableItem && (
          <>
            <View
              style={[
                styles.defaultPriceInfo,
                {
                  backgroundColor: Colors[colorScheme === 'dark' ? 'dark' : 'light'].cardBackground,
                },
              ]}
            >
              <ThemedText style={styles.defaultPriceLabel}>
                {LL.priceList.defaultLabel()}
              </ThemedText>
              <ThemedText style={styles.defaultPriceValue}>
                {formatPrice(
                  selectedAvailableItem.defaultPrice,
                  normalizeCurrencyCode(
                    selectedAvailableItem.defaultPriceCurrency,
                    defaultInvoiceCurrency,
                  ),
                  intlLocale,
                )}
              </ThemedText>
            </View>

            <ThemedText style={styles.defaultPriceLabel}>
              {LL.priceList.currencyInherited({
                currency: normalizeCurrencyCode(
                  selectedAvailableItem.defaultPriceCurrency,
                  defaultInvoiceCurrency,
                ),
              })}
            </ThemedText>
          </>
        )}
      </BottomSheetFormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 0,
  },
  overrideContent: {
    flexDirection: 'column',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  itemName: {
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  unitLabel: {
    fontSize: FontSizes.xs,
    opacity: Opacity.muted,
  },
  twoColumnRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  column: {
    flex: 1,
  },
  detailTextContainer: {
    flex: 1,
    gap: 0,
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    opacity: Opacity.muted,
    lineHeight: FontSizes.sm,
  },
  detailValue: {
    fontSize: FontSizes.base,
  },
  textRight: {
    textAlign: 'right',
  },
  customPriceValue: {
    fontWeight: '600',
  },
  editingItemInfo: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  editingItemHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  editingItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  editingItemUnit: {
    fontSize: FontSizes.xs,
    opacity: Opacity.muted,
  },
  editingItemPrice: {
    fontSize: 14,
    opacity: 0.7,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  noItemsText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
    padding: 12,
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
});
