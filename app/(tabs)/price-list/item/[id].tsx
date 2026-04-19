import { PriceListItemOverrideSection } from '@/components/price-list/price-list-item-override-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HeaderActions } from '@/components/ui/header-actions';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BorderRadius, Colors, FontSizes, Opacity, Spacing } from '@/constants/theme';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { PriceListItemModel, VatCodeModel, VatRateModel } from '@/model';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';
import { getLocalizedVatCodeName } from '@/utils/vat-code-utils';
import { Q } from '@nozbe/watermelondb';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function resolveVatRateForDate(rates: VatRateModel[], taxableAt: number): number | null {
  const matching = rates.filter(
    (rate) => rate.validFrom <= taxableAt && (rate.validTo == null || rate.validTo >= taxableAt),
  );
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.validFrom - a.validFrom);
  return matching[0].ratePercent;
}

function formatVatRatePercent(ratePercent: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Number.isInteger(ratePercent) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(ratePercent);
}

export default function PriceListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const [item, setItem] = useState<PriceListItemModel | null>(null);
  const [vatCodeName, setVatCodeName] = useState<string | null>(null);
  const [resolvedVatRate, setResolvedVatRate] = useState<number | null>(null);
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const displayVatCodeName = vatCodeName
    ? getLocalizedVatCodeName(vatCodeName, LL)
    : item?.vatName
      ? getLocalizedVatCodeName(item.vatName, LL)
      : null;

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!id) return;

    const loadItem = async () => {
      const items = database.get<PriceListItemModel>(PriceListItemModel.table);
      const itemData = await items.find(id);
      setItem(itemData);
    };

    loadItem();

    // Subscribe to item changes
    const subscription = database
      .get<PriceListItemModel>(PriceListItemModel.table)
      .findAndObserve(id)
      .subscribe(setItem);

    return () => subscription.unsubscribe();
  }, [id]);

  useEffect(() => {
    const loadVatCodeName = async () => {
      if (!item?.vatCodeId) {
        setVatCodeName(null);
        setResolvedVatRate(null);
        return;
      }

      try {
        const [vatCode, vatRates] = await Promise.all([
          database.get<VatCodeModel>(VatCodeModel.table).find(item.vatCodeId),
          database
            .get<VatRateModel>(VatRateModel.table)
            .query(Q.where('vat_code_id', item.vatCodeId))
            .fetch(),
        ]);
        setVatCodeName(vatCode.name);
        setResolvedVatRate(resolveVatRateForDate(vatRates, Date.now()));
      } catch {
        setVatCodeName(null);
        setResolvedVatRate(null);
      }
    };

    void loadVatCodeName();
  }, [item?.vatCodeId]);

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    return unit; // Custom unit - return as is
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
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: LL.priceList.title(),
          headerRight: () => (
            <HeaderActions>
              <IconButton
                iconName="pencil"
                iconSize={18}
                onPress={() => router.push(`/price-list/item/${id}/edit`)}
                accessibilityLabel={LL.common.edit()}
              />
            </HeaderActions>
          ),
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={contentStyle}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      >
        {/* Item name and status badge */}
        <View style={styles.nameSection}>
          <Animated.Text
            style={[
              styles.name,
              {
                color: colorScheme === 'dark' ? Colors.dark.text : Colors.light.text,
                fontSize: scrollY.interpolate({
                  inputRange: [0, 100],
                  outputRange: [FontSizes['3xl'], FontSizes.xl],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            {item.name}
          </Animated.Text>
          {!item.isActive && (
            <Animated.View
              style={[
                styles.inactiveBadge,
                {
                  backgroundColor: Colors[colorScheme ?? 'light'].buttonNeutralBackground,
                  opacity: scrollY.interpolate({
                    inputRange: [0, 80],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: scrollY.interpolate({
                        inputRange: [0, 80],
                        outputRange: [1, 0.8],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.inactiveBadgeText,
                  { color: Colors[colorScheme ?? 'light'].textMuted },
                ]}
              >
                {LL.priceList.inactive()}
              </ThemedText>
            </Animated.View>
          )}
        </View>

        {/* Details Section */}
        <ThemedView style={styles.section}>
          {/* Default Price */}
          <View
            style={[
              styles.infoBox,
              { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
            ]}
          >
            <View style={styles.detailContent}>
              <View style={styles.iconContainer}>
                <IconSymbol name="tag" size={30} color={Colors[colorScheme ?? 'light'].icon} />
              </View>
              <View style={styles.detailTextContainer}>
                <ThemedText style={styles.detailValue}>
                  {formatPrice(
                    item.defaultPrice,
                    normalizeCurrencyCode(item.defaultPriceCurrency, defaultInvoiceCurrency),
                    intlLocale,
                  )}
                </ThemedText>
                <ThemedText style={styles.detailLabel}>{LL.priceList.defaultPrice()}</ThemedText>
              </View>
              <View style={styles.unitContainer}>
                <ThemedText style={styles.unitText}>/ {getUnitLabel(item.unit)}</ThemedText>
              </View>
            </View>
          </View>

          {/* Description */}
          {item.description && (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
              ]}
            >
              <View style={styles.detailContent}>
                <View style={styles.iconContainer}>
                  <IconSymbol
                    name="note.text"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].icon}
                  />
                </View>
                <View style={styles.detailTextContainer}>
                  <ThemedText style={styles.detailValue}>{item.description}</ThemedText>
                  <ThemedText style={styles.detailLabel}>{LL.priceList.description()}</ThemedText>
                </View>
              </View>
            </View>
          )}

          {/* VAT code name */}
          {displayVatCodeName && (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: Colors[colorScheme ?? 'light'].cardBackground },
              ]}
            >
              <View style={styles.detailContent}>
                <View style={styles.iconContainer}>
                  <IconSymbol
                    name="percent"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].icon}
                  />
                </View>
                <View style={styles.detailTextContainer}>
                  <ThemedText style={styles.detailValue}>{displayVatCodeName}</ThemedText>
                  <ThemedText style={styles.detailLabel}>{LL.priceList.vatName()}</ThemedText>
                </View>
                {resolvedVatRate != null && (
                  <View style={styles.unitContainer}>
                    <ThemedText style={styles.unitText}>
                      {formatVatRatePercent(resolvedVatRate)} %
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}
        </ThemedView>

        {/* Client Overrides Section */}
        <ThemedView style={styles.overridesSection}>
          <PriceListItemOverrideSection priceListItem={item} />
        </ThemedView>
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  nameSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  name: {
    fontSize: FontSizes['3xl'],
    fontWeight: 'bold',
    textAlign: 'center',
  },
  inactiveBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    alignSelf: 'center',
  },
  inactiveBadgeText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  overridesSection: {
    marginTop: 0,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  infoBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  detailContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
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
  unitContainer: {
    marginLeft: 8,
  },
  unitText: {
    fontSize: FontSizes.base,
    opacity: Opacity.muted,
  },
});
