import { ActionEmptyState } from '@/components/ui/action-empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useCurrencySettings } from '@/hooks/use-currency-settings';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import CurrencySettingModel from '@/model/CurrencySettingModel';
import {
  CURRENCY_SETTING_IN_USE,
  CURRENCY_SETTING_LAST_REMAINING,
  deleteCurrencySetting,
  ensureCurrencySettingsSeeded,
} from '@/repositories/currency-settings-repository';
import { formatPrice } from '@/utils/price-utils';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

function CurrencyListItem({
  currency,
  locale,
  onPress,
}: {
  currency: CurrencySettingModel;
  locale: string;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowContainer,
        { backgroundColor: palette.cardBackground },
        pressed && styles.rowPressed,
      ]}
      android_ripple={{ color: palette.border }}
      accessibilityRole="button"
      accessibilityLabel={currency.code}
    >
      <View style={styles.rowContent}>
        <View style={[styles.codeBadge, { backgroundColor: palette.infoBadgeBackground }]}>
          <ThemedText style={[styles.codeBadgeText, { color: palette.infoBadgeText }]}>
            {currency.code}
          </ThemedText>
        </View>

        <View style={styles.info}>
          <ThemedText type="defaultSemiBold" style={styles.name}>
            {formatPrice(1234.56, currency.code, locale)}
          </ThemedText>
          <ThemedText style={styles.meta} numberOfLines={1}>
            {currency.prefix || '∅'} · {currency.suffix || '∅'}
          </ThemedText>
        </View>

        <IconSymbol name="chevron.right" size={20} color={palette.icon} />
      </View>
      <View style={[styles.divider, { borderBottomColor: palette.border }]} />
    </Pressable>
  );
}

export default function SettingsCurrenciesScreen() {
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const currencies = useCurrencySettings(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedCurrencies = async () => {
    try {
      setIsSeeding(true);
      await ensureCurrencySettingsSeeded();
      Alert.alert(LL.common.success(), LL.settings.currencySeedSuccess());
    } catch (error) {
      console.error('Error seeding currencies:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteCurrency = (currency: CurrencySettingModel) => {
    Alert.alert(
      LL.settings.currencyDeleteTitle(),
      LL.settings.currencyDeleteMessage({ code: currency.code }),
      [
        { text: LL.common.cancel(), style: 'cancel' },
        {
          text: LL.settings.currencyDeleteConfirm(),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteCurrencySetting(currency.id);
                Alert.alert(LL.common.success(), LL.settings.saveSuccess());
              } catch (error) {
                const message =
                  error instanceof Error && error.message === CURRENCY_SETTING_IN_USE
                    ? LL.settings.currencyDeleteInUse()
                    : error instanceof Error && error.message === CURRENCY_SETTING_LAST_REMAINING
                      ? LL.settings.currencyDeleteLastRemaining()
                      : LL.settings.saveError();
                Alert.alert(LL.common.error(), message);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.settings.currenciesTitle(),
          headerRight: () => (
            <IconButton
              iconName="plus.circle.fill"
              accessibilityLabel={LL.settings.addCurrency()}
              onPress={() => router.push('/settings/currency-form')}
            />
          ),
        }}
      />

      <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.description}>{LL.settings.currenciesSubtitle()}</ThemedText>

        {currencies.length === 0 ? (
          <ActionEmptyState
            iconName="dollarsign.circle.fill"
            title={LL.settings.currenciesEmptyTitle()}
            description={LL.settings.currenciesEmptyDescription()}
            actionLabel={isSeeding ? LL.common.loading() : LL.settings.currencySeedDefaults()}
            onActionPress={() => void handleSeedCurrencies()}
          />
        ) : (
          <ThemedView style={[styles.listCard, { backgroundColor: palette.cardBackground }]}>
            {currencies.map((currency) => (
              <View key={currency.id} style={styles.rowWrapper}>
                <SwipeableRow
                  onEdit={() => router.push(`/settings/currency-form?id=${currency.id}`)}
                  onDelete={() => handleDeleteCurrency(currency)}
                >
                  <CurrencyListItem
                    currency={currency}
                    locale={intlLocale}
                    onPress={() => router.push(`/settings/currency-form?id=${currency.id}`)}
                  />
                </SwipeableRow>
              </View>
            ))}
          </ThemedView>
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
    padding: 16,
    paddingBottom: 24,
    gap: 14,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.72,
  },
  listCard: {
    marginHorizontal: -16,
    overflow: 'hidden',
  },
  rowWrapper: {
    overflow: 'hidden',
  },
  rowContainer: {
    backgroundColor: 'transparent',
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  codeBadge: {
    minWidth: 52,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  codeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 17,
  },
  meta: {
    fontSize: 13,
    opacity: 0.6,
  },
  divider: {
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
});
