import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PRICE_LIST_UNITS, getPriceListUnitLabel } from '@/components/price-list/unit-options';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Colors, getSwitchColors } from '@/constants/theme';
import database from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { PriceListItemModel, VatCodeModel } from '@/model';
import { updatePriceListItem } from '@/repositories/price-list-repository';
import { getSettings } from '@/repositories/settings-repository';
import { getVatCodes } from '@/repositories/vat-rate-repository';
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/utils/currency-utils';
import { getLocalizedVatCodeName } from '@/utils/vat-code-utils';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, Pressable, View } from 'react-native';

type PriceListFormData = {
  name: string;
  description: string;
  defaultPrice: string;
  defaultPriceCurrency: string;
  unit: string;
  customUnit: string;
  vatCodeId: string;
  isActive: boolean;
};

export default function EditPriceListItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL } = useI18nContext();
  const currencies = useCurrencySettings();
  const [item, setItem] = useState<PriceListItemModel | null>(null);
  const [formData, setFormData] = useState<PriceListFormData>({
    name: '',
    description: '',
    defaultPrice: '',
    defaultPriceCurrency: DEFAULT_CURRENCY_CODE,
    unit: 'hour',
    customUnit: '',
    vatCodeId: '',
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [vatCodes, setVatCodes] = useState<VatCodeModel[]>([]);
  const displayVatCodes = useMemo(
    () =>
      [...vatCodes].sort((a, b) =>
        getLocalizedVatCodeName(a.name, LL).localeCompare(getLocalizedVatCodeName(b.name, LL)),
      ),
    [LL, vatCodes],
  );

  useEffect(() => {
    if (!id) return;

    const loadItem = async () => {
      try {
        const settings = await getSettings();
        const vatPayer = settings.isVatPayer ?? false;
        setIsVatPayer(vatPayer);
        let loadedVatCodes: VatCodeModel[] = [];
        if (vatPayer) {
          const codes = await getVatCodes().fetch();
          setVatCodes(codes);
          loadedVatCodes = codes;
        }

        const items = database.get<PriceListItemModel>(PriceListItemModel.table);
        const itemData = await items.find(id);
        setItem(itemData);

        // Check if unit is a custom unit
        const isCustomUnit = !['hour', 'piece', 'project', 'day'].includes(itemData.unit);

        const matchedVatCodeId =
          itemData.vatCodeId ||
          (itemData.vatName
            ? loadedVatCodes.find(
                (code) => code.name.toLocaleLowerCase() === itemData.vatName?.toLocaleLowerCase(),
              )?.id || ''
            : '');
        const fallbackVatCodeId =
          vatPayer && !matchedVatCodeId ? loadedVatCodes[0]?.id || '' : matchedVatCodeId;

        setFormData({
          name: itemData.name,
          description: itemData.description || '',
          defaultPrice: itemData.defaultPrice.toString(),
          defaultPriceCurrency: normalizeCurrencyCode(itemData.defaultPriceCurrency),
          unit: isCustomUnit ? 'custom' : itemData.unit,
          customUnit: isCustomUnit ? itemData.unit : '',
          vatCodeId: fallbackVatCodeId,
          isActive: itemData.isActive,
        });
      } catch (error) {
        console.error('Error loading price list item:', error);
        Alert.alert(LL.common.error(), LL.common.error());
        router.back();
      }
    };

    loadItem();
  }, [id, LL, router]);

  const handleSubmit = async () => {
    if (!id || !item) return;

    if (!formData.name.trim()) {
      Alert.alert(LL.common.error(), LL.priceList.errorRequiredFields());
      return;
    }

    const price = parseFloat(formData.defaultPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert(LL.common.error(), LL.priceList.errorInvalidPrice());
      return;
    }

    if (formData.unit === 'custom' && !formData.customUnit.trim()) {
      Alert.alert(LL.common.error(), LL.priceList.errorRequiredFields());
      return;
    }

    if (isVatPayer && !formData.vatCodeId.trim()) {
      Alert.alert(LL.common.error(), LL.priceList.errorVatNameRequired());
      return;
    }

    const unitToSave = formData.unit === 'custom' ? formData.customUnit.trim() : formData.unit;

    setIsSubmitting(true);
    try {
      const selectedVatCode = vatCodes.find((code) => code.id === formData.vatCodeId);
      await updatePriceListItem({
        id,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        defaultPrice: price,
        defaultPriceCurrency: formData.defaultPriceCurrency,
        unit: unitToSave,
        vatCodeId: isVatPayer ? formData.vatCodeId || undefined : undefined,
        vatName: isVatPayer ? selectedVatCode?.name || undefined : undefined,
        isActive: formData.isActive,
      });
      router.back();
    } catch (error) {
      console.error('Error updating price list item:', error);
      Alert.alert(LL.common.error(), LL.common.error());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (!item) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: LL.common.loading() }} />
        <ThemedText>{LL.common.loading()}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: LL.priceList.editItem(), headerBackTitle: LL.priceList.title() }}
      />
      <ThemedView style={styles.container}>
        <KeyboardAwareScroll showsVerticalScrollIndicator={false}>
          <ThemedText style={styles.label}>{LL.priceList.itemName()} *</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                color: Colors[colorScheme ?? 'light'].text,
                borderColor: Colors[colorScheme ?? 'light'].inputBorder,
              },
            ]}
            placeholder={LL.priceList.itemName()}
            placeholderTextColor={Colors[colorScheme ?? 'light'].placeholder}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />

          <ThemedText style={styles.label}>{LL.priceList.description()}</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                color: Colors[colorScheme ?? 'light'].text,
                borderColor: Colors[colorScheme ?? 'light'].inputBorder,
              },
            ]}
            placeholder={LL.priceList.description()}
            placeholderTextColor={Colors[colorScheme ?? 'light'].placeholder}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            multiline
            numberOfLines={3}
          />

          <ThemedText style={styles.label}>{LL.priceList.defaultPrice()} *</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                color: Colors[colorScheme ?? 'light'].text,
                borderColor: Colors[colorScheme ?? 'light'].inputBorder,
              },
            ]}
            placeholder="0.00"
            placeholderTextColor={Colors[colorScheme ?? 'light'].placeholder}
            value={formData.defaultPrice}
            onChangeText={(text) => setFormData({ ...formData, defaultPrice: text })}
            keyboardType="decimal-pad"
          />

          <ThemedText style={styles.label}>{LL.priceList.currency()} *</ThemedText>
          <Select
            value={formData.defaultPriceCurrency}
            onValueChange={(value) => setFormData({ ...formData, defaultPriceCurrency: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder={formData.defaultPriceCurrency} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{LL.priceList.currency()}</SelectLabel>
                {currencies.map((currency) => (
                  <SelectItem key={currency.id} value={currency.code} label={currency.code}>
                    {currency.code}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <ThemedText style={styles.label}>{LL.priceList.unit()} *</ThemedText>
          <Select
            value={formData.unit}
            onValueChange={(unit) => setFormData({ ...formData, unit })}
          >
            <SelectTrigger>
              <SelectValue placeholder={LL.priceList.unit()} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{LL.priceList.unit()}</SelectLabel>
                {PRICE_LIST_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit} label={getPriceListUnitLabel(LL, unit)}>
                    {getPriceListUnitLabel(LL, unit)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {isVatPayer && (
            <>
              <ThemedText style={styles.label}>{LL.priceList.vatRate()} *</ThemedText>
              <Select
                value={formData.vatCodeId}
                onValueChange={(vatCodeId) => setFormData({ ...formData, vatCodeId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={LL.priceList.vatRate()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{LL.priceList.vatRate()}</SelectLabel>
                    {displayVatCodes.map((vatCode) => (
                      <SelectItem
                        key={vatCode.id}
                        value={vatCode.id}
                        label={getLocalizedVatCodeName(vatCode.name, LL)}
                      >
                        {getLocalizedVatCodeName(vatCode.name, LL)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {vatCodes.length === 0 && (
                <ThemedText style={styles.helperText}>{LL.priceList.noVatCodes()}</ThemedText>
              )}
            </>
          )}

          {formData.unit === 'custom' && (
            <>
              <ThemedText style={styles.label}>{LL.priceList.units.custom()} *</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.inputBorder,
                  },
                ]}
                placeholder={LL.priceList.units.custom()}
                placeholderTextColor={palette.placeholder}
                value={formData.customUnit}
                onChangeText={(text) => setFormData({ ...formData, customUnit: text })}
              />
            </>
          )}

          <View style={styles.switchRow}>
            <ThemedText style={styles.switchLabel}>{LL.priceList.active()}</ThemedText>
            <Switch
              value={formData.isActive}
              onValueChange={(value) => setFormData({ ...formData, isActive: value })}
              {...getSwitchColors(palette)}
              accessibilityLabel={LL.priceList.active()}
            />
          </View>

          <View style={styles.formActions}>
            <Pressable
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: palette.buttonNeutralBackground },
              ]}
              onPress={handleCancel}
            >
              <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                {LL.common.cancel()}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: palette.tint }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                {LL.common.save()}
              </ThemedText>
            </Pressable>
          </View>
        </KeyboardAwareScroll>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: -4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    marginTop: 8,
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 16,
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
