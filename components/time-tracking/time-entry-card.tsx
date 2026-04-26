import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Shadows, withOpacity } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { useDefaultInvoiceCurrency } from '@/hooks/use-default-invoice-currency';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { ClientModel, PriceListItemModel, TimeEntryModel } from '@/model';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { hasEffectiveBillingInterval, roundTimeByInterval } from '@/utils/time-utils';
import { formatPrice } from '@/utils/price-utils';
import { getDisplayedTimeEntryDuration } from '@/utils/time-entry-duration-utils';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import database from '@/db';
import { Q } from '@nozbe/watermelondb';

type TimeEntryCardProps = {
  item: TimeEntryModel;
  client: ClientModel | undefined;
  defaultBillingInterval?: number;
  formatTime: (seconds: number) => string;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  hideClient?: boolean;
};

export function TimeEntryCard({
  item,
  client,
  defaultBillingInterval,
  formatTime,
  onDelete,
  onEdit,
  hideClient = false,
}: TimeEntryCardProps) {
  const colorScheme = useColorScheme();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const defaultInvoiceCurrency = useDefaultInvoiceCurrency();
  const [priceListItem, setPriceListItem] = useState<PriceListItemModel | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const duration = getDisplayedTimeEntryDuration(item, nowMs);
  const billableDuration = roundTimeByInterval(duration, client, defaultBillingInterval);
  const date = new Date(item.startTime);
  const showBillingTime =
    hasEffectiveBillingInterval(client, defaultBillingInterval) && billableDuration !== duration;
  const isRunning = item.isRunning;
  const isPaused = item.isPaused;

  // Load price list item if associated
  useEffect(() => {
    if (!item.priceListItemId) {
      setPriceListItem(null);
      return;
    }

    const subscription = database
      .get<PriceListItemModel>(PriceListItemModel.table)
      .query(Q.where('id', item.priceListItemId))
      .observeWithColumns(['name', 'default_price_currency', 'unit'])
      .subscribe((items) => {
        setPriceListItem(items[0] ?? null);
      });

    return () => subscription.unsubscribe();
  }, [item.priceListItemId]);

  useEffect(() => {
    if (!item.isRunning) return;

    setNowMs(Date.now());
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [item.isRunning, item.isPaused, item.pausedAt, item.startTime, item.totalPausedDuration]);

  const getUnitLabel = (unit: string) => {
    if (unit === 'hour') return LL.priceList.units.hour();
    if (unit === 'piece') return LL.priceList.units.piece();
    if (unit === 'project') return LL.priceList.units.project();
    if (unit === 'day') return LL.priceList.units.day();
    if (unit === 'custom') return LL.priceList.units.custom();
    return unit;
  };

  const accentColor = isRunning
    ? isPaused
      ? palette.timerPause
      : palette.timeHighlight
    : 'transparent';

  const cardBg = isRunning
    ? isPaused
      ? colorScheme === 'dark'
        ? withOpacity(palette.timerPause, 0.12)
        : withOpacity(palette.timerPause, 0.06)
      : colorScheme === 'dark'
        ? withOpacity(palette.timeHighlight, 0.15)
        : withOpacity(palette.timeHighlight, 0.07)
    : palette.cardBackground;

  return (
    <ThemedView
      style={[
        styles.entryCard,
        {
          borderColor: isRunning ? accentColor : palette.border,
          backgroundColor: cardBg,
          borderWidth: 1,
          ...(isRunning && colorScheme === 'light' ? Shadows.sm : {}),
        },
      ]}
    >
      {isRunning && <View style={[styles.accentStrip, { backgroundColor: accentColor }]} />}
      <View style={[styles.entryHeader, isRunning && styles.entryHeaderWithStrip]}>
        <View style={styles.entryInfo}>
          <View style={styles.titleRow}>
            <ThemedText type="defaultSemiBold" style={!item.description && { opacity: 0.5 }}>
              {item.description || LL.timeTracking.noDescription()}
            </ThemedText>
            {isRunning && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: isPaused ? palette.timerPause : palette.timeHighlight },
                ]}
              >
                <ThemedText style={[styles.statusText, { color: palette.onTint }]}>
                  {isPaused
                    ? LL.timeTracking.paused().toUpperCase()
                    : LL.timeTracking.running().toUpperCase()}
                </ThemedText>
              </View>
            )}
          </View>
          {!hideClient && client && (
            <ThemedText style={[styles.clientName, { color: palette.timeHighlight }]}>
              {client.name}
            </ThemedText>
          )}
          {priceListItem && item.rate !== undefined && (
            <View style={styles.priceListInfo}>
              <IconSymbol name="tag.fill" size={14} color={palette.timeHighlight} />
              <ThemedText style={styles.priceListText}>
                {priceListItem.name} •{' '}
                {formatPrice(
                  item.rate,
                  normalizeCurrencyCode(
                    item.rateCurrency,
                    priceListItem.defaultPriceCurrency || defaultInvoiceCurrency,
                  ),
                  intlLocale,
                )}{' '}
                / {getUnitLabel(priceListItem.unit)}
              </ThemedText>
            </View>
          )}
          <ThemedText style={styles.entryDate}>
            {date.toLocaleDateString(intlLocale)}{' '}
            {date.toLocaleTimeString(intlLocale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </ThemedText>
        </View>
        <View style={styles.entryActions}>
          <View style={styles.durationContainer}>
            {showBillingTime ? (
              <>
                <ThemedText style={[styles.billableDuration, { color: palette.timeHighlight }]}>
                  {formatTime(billableDuration)}
                </ThemedText>
                <ThemedText style={styles.actualDuration}>({formatTime(duration)})</ThemedText>
              </>
            ) : (
              <ThemedText style={styles.duration}>{formatTime(duration)}</ThemedText>
            )}
          </View>
          <View style={styles.actionButtons}>
            <Pressable
              onPress={() => onEdit(item.id)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              android_ripple={{ color: palette.border, borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={LL.common.edit()}
            >
              <IconSymbol name="pencil" size={18} color={palette.timeHighlight} />
            </Pressable>
            <Pressable
              onPress={() => onDelete(item.id)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              android_ripple={{ color: palette.border, borderless: false }}
              accessibilityRole="button"
              accessibilityLabel={LL.common.delete()}
            >
              <IconSymbol name="trash.fill" size={18} color={palette.timerStop} />
            </Pressable>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  entryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
  },
  entryHeaderWithStrip: {
    paddingLeft: 17,
  },
  entryInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    minHeight: 24,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  clientName: {
    fontSize: 14,
    marginTop: 2,
    opacity: 0.8,
  },
  priceListInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  priceListText: {
    fontSize: 12,
    opacity: 0.7,
  },
  entryDate: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.6,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  durationContainer: {
    alignItems: 'flex-end',
  },
  duration: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  billableDuration: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  actualDuration: {
    fontSize: 11,
    marginTop: 2,
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.72,
  },
});
