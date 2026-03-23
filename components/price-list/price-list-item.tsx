import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { PriceListItemModel } from '@/model';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPrice } from '@/utils/price-utils';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface PriceListItemProps {
  item: PriceListItemModel;
  fallbackCurrency: string;
  onPress: (id: string) => void;
}

export function PriceListItem({ item, fallbackCurrency, onPress }: PriceListItemProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: palette.cardBackground },
        {
          opacity: item.isActive ? (pressed ? 0.72 : 1) : 0.5,
        },
      ]}
      android_ripple={{ color: palette.border }}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.content}>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <ThemedText type="defaultSemiBold" style={styles.name}>
              {item.name}
            </ThemedText>
            {!item.isActive && (
              <View style={[styles.badge, { backgroundColor: palette.placeholder }]}>
                <ThemedText style={[styles.badgeText, { color: palette.onTint }]}>
                  {LL.priceList.inactive()}
                </ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.price}>
            {formatPrice(
              item.defaultPrice,
              normalizeCurrencyCode(item.defaultPriceCurrency, fallbackCurrency),
              intlLocale,
            )}{' '}
            / {getUnitLabel(item.unit)}
          </ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={20} color={palette.icon} />
      </View>
      <View
        style={[
          styles.divider,
          {
            borderBottomColor: palette.border,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  divider: {
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 17,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  price: {
    fontSize: 14,
    opacity: 0.7,
  },
});
