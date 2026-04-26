import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CrossPlatformDatePicker } from '@/components/ui/cross-platform-date-picker';
import { EntityPickerField } from '@/components/ui/entity-picker-field';
import { IconButton } from '@/components/ui/icon-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import {
  getEuMemberStateLabel,
  getEuMemberStateOptions,
  normalizeEuMemberStateCode,
} from '@/constants/eu-countries';
import { getSwitchColors } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import { VatCodeModel, VatRateModel } from '@/model';
import {
  type EuVatBootstrapPreview,
  type EuVatBootstrapRateKind,
  fetchEuVatBootstrapPreview,
} from '@/repositories/eu-vat-bootstrap-repository';
import { getSettings } from '@/repositories/settings-repository';
import {
  addVatRates,
  createVatRate,
  deleteVatCode,
  deleteVatRate,
  getVatCodes,
  getVatRates,
  renameVatCode,
  replaceAllVatRates,
  updateVatRate,
  VAT_VALID_FROM_BEGINNING_TS,
} from '@/repositories/vat-rate-repository';
import { parseISODate, toLocalISODate } from '@/utils/iso-date';
import { parseDecimalInputInRange } from '@/utils/number-input';
import { isIos } from '@/utils/platform';
import {
  createBootstrapVatCodeToken,
  getLocalizedVatCodeName,
  isBootstrapVatCodeToken,
} from '@/utils/vat-code-utils';
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  Pressable,
  View,
} from 'react-native';

export default function SettingsVatScreen() {
  const palette = usePalette();
  const switchColors = getSwitchColors(palette);
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const groupListStyle = useBottomSafeAreaStyle(styles.groupList);
  const modalScrollContentStyle = useBottomSafeAreaStyle(styles.modalScrollContent);
  const [vatCodes, setVatCodes] = useState<VatCodeModel[]>([]);
  const [vatRates, setVatRates] = useState<VatRateModel[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<VatRateModel | null>(null);
  const [isCreatingCodeWithFirstRate, setIsCreatingCodeWithFirstRate] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeOriginalName, setEditingCodeOriginalName] = useState('');
  const [codeName, setCodeName] = useState('');
  const [selectedRateCodeName, setSelectedRateCodeName] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [activeDateField, setActiveDateField] = useState<'from' | 'to' | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [bootstrapCountry, setBootstrapCountry] = useState('');
  const [bootstrapPreview, setBootstrapPreview] = useState<EuVatBootstrapPreview | null>(null);
  const [isBootstrapLoading, setIsBootstrapLoading] = useState(false);
  const [bootstrapReplaceMode, setBootstrapReplaceMode] = useState(true);

  const vatCodeNameById = useMemo(() => {
    const map = new Map<string, string>();
    vatCodes.forEach((code) => map.set(code.id, code.name));
    return map;
  }, [vatCodes]);

  const resolveRateRawName = useCallback(
    (rate: VatRateModel): string => (rate.vatCodeId && vatCodeNameById.get(rate.vatCodeId)) || '',
    [vatCodeNameById],
  );

  const resolveRateName = useCallback(
    (rate: VatRateModel): string => {
      const rawName = resolveRateRawName(rate);
      return rawName ? getLocalizedVatCodeName(rawName, LL) : LL.settings.vatRateUnnamed();
    },
    [LL, resolveRateRawName],
  );

  const groupedRates = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; codeId?: string; rawName: string; name: string; rates: VatRateModel[] }
    >();

    vatRates.forEach((rate) => {
      const rawName = resolveRateRawName(rate);
      const displayName = resolveRateName(rate);
      const key = rate.vatCodeId || displayName.toLocaleLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.rates.push(rate);
      } else {
        groups.set(key, {
          key,
          codeId: rate.vatCodeId,
          rawName,
          name: displayName,
          rates: [rate],
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, intlLocale));
  }, [intlLocale, resolveRateName, resolveRateRawName, vatRates]);

  const euCountryOptions = useMemo(() => getEuMemberStateOptions(locale), [locale]);

  const bootstrapPreviewRows = useMemo(() => {
    if (!bootstrapPreview) return [];

    const totalByKind = bootstrapPreview.rates.reduce<Record<EuVatBootstrapRateKind, number>>(
      (acc, rate) => {
        acc[rate.kind] += 1;
        return acc;
      },
      {
        standard: 0,
        reduced: 0,
        superReduced: 0,
        parking: 0,
        exempt: 0,
      },
    );

    const seenByKind = {
      standard: 0,
      reduced: 0,
      superReduced: 0,
      parking: 0,
      exempt: 0,
    } satisfies Record<EuVatBootstrapRateKind, number>;

    return bootstrapPreview.rates.map((rate) => {
      seenByKind[rate.kind] += 1;
      const index = seenByKind[rate.kind];
      const total = totalByKind[rate.kind];
      const codeName = createBootstrapVatCodeToken(rate.kind, index, total, bootstrapCountry);

      return {
        ...rate,
        codeName,
        displayName: getLocalizedVatCodeName(codeName, LL),
      };
    });
  }, [LL, bootstrapCountry, bootstrapPreview]);

  useEffect(() => {
    const codeSubscription = getVatCodes().observeWithColumns(['name']).subscribe(setVatCodes);
    const subscription = getVatRates()
      .observeWithColumns(['vat_code_id', 'rate_percent', 'valid_from', 'valid_to'])
      .subscribe(setVatRates);

    void getSettings().then((settings) => {
      const normalizedCountry = normalizeEuMemberStateCode(settings.invoiceCountry);
      if (normalizedCountry) {
        setBootstrapCountry(normalizedCountry);
      }
    });

    return () => {
      codeSubscription.unsubscribe();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (bootstrapPreview && bootstrapPreview.memberState !== bootstrapCountry) {
      setBootstrapPreview(null);
    }
  }, [bootstrapCountry, bootstrapPreview]);

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString(intlLocale);
  };

  const formatValidFrom = (timestamp?: number): string => {
    if (!timestamp || timestamp <= VAT_VALID_FROM_BEGINNING_TS) {
      return LL.settings.vatRateNoStart();
    }
    return formatDate(timestamp);
  };

  const toInputDate = (timestamp?: number): string => {
    if (!timestamp || timestamp <= VAT_VALID_FROM_BEGINNING_TS) return '';
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const openCreateModalForCode = (rawName: string) => {
    setEditingRate(null);
    setIsCreatingCodeWithFirstRate(false);
    setSelectedRateCodeName(rawName);
    setRatePercent('');
    setValidFrom('');
    setValidTo('');
    closeDatePicker();
    setShowModal(true);
  };

  const openCreateCodeModal = () => {
    setEditingRate(null);
    setIsCreatingCodeWithFirstRate(true);
    setSelectedRateCodeName('');
    setRatePercent('');
    setValidFrom('');
    setValidTo('');
    closeDatePicker();
    setShowModal(true);
  };

  const openEditModal = (item: VatRateModel) => {
    setEditingRate(item);
    setIsCreatingCodeWithFirstRate(false);
    setSelectedRateCodeName(resolveRateRawName(item));
    setRatePercent(String(item.ratePercent));
    setValidFrom(toInputDate(item.validFrom));
    setValidTo(toInputDate(item.validTo));
    closeDatePicker();
    setShowModal(true);
  };

  const openEditCodeModal = (codeId: string, rawName: string) => {
    setEditingCodeId(codeId);
    setEditingCodeOriginalName(rawName);
    setCodeName(getLocalizedVatCodeName(rawName, LL));
    setShowCodeModal(true);
  };

  const openDatePicker = (field: 'from' | 'to') => {
    const currentValue = field === 'from' ? validFrom : validTo;
    const timestamp = currentValue ? parseISODate(currentValue) : Date.now();
    setPickerDate(new Date(timestamp ?? Date.now()));
    setActiveDateField(field);
  };

  const closeDatePicker = () => {
    setActiveDateField(null);
  };

  const applyDate = (field: 'from' | 'to', selectedDate: Date) => {
    const nextValue = toLocalISODate(selectedDate);
    if (field === 'from') {
      setValidFrom(nextValue);
      return;
    }
    setValidTo(nextValue);
  };

  const handleDeleteCode = (codeId: string) => {
    Alert.alert(LL.settings.vatCodeDeleteTitle(), LL.settings.vatCodeDeleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: () => deleteVatCode(codeId),
      },
    ]);
  };

  const handleSaveCode = async () => {
    if (!editingCodeId) return;
    const trimmedName = codeName.trim();
    if (!trimmedName) {
      Alert.alert(LL.common.error(), LL.settings.vatCodeNameRequired());
      return;
    }

    if (
      isBootstrapVatCodeToken(editingCodeOriginalName) &&
      trimmedName === getLocalizedVatCodeName(editingCodeOriginalName, LL)
    ) {
      setShowCodeModal(false);
      setEditingCodeId(null);
      setEditingCodeOriginalName('');
      setCodeName('');
      return;
    }

    const targetCode = vatCodes.find(
      (code) =>
        code.id !== editingCodeId &&
        getLocalizedVatCodeName(code.name, LL).trim().toLocaleLowerCase() ===
          trimmedName.toLocaleLowerCase(),
    );

    if (targetCode) {
      const currentRates = vatRates.filter((rate) => rate.vatCodeId === editingCodeId);
      const targetRates = vatRates.filter((rate) => rate.vatCodeId === targetCode.id);

      const hasOverlap = currentRates.some((rateA) =>
        targetRates.some((rateB) => {
          const aFrom = rateA.validFrom;
          const aTo = rateA.validTo ?? Number.POSITIVE_INFINITY;
          const bFrom = rateB.validFrom;
          const bTo = rateB.validTo ?? Number.POSITIVE_INFINITY;
          return aFrom <= bTo && bFrom <= aTo;
        }),
      );

      if (hasOverlap) {
        Alert.alert(LL.common.error(), LL.settings.vatRateOverlapError());
        return;
      }
    }

    try {
      await renameVatCode(editingCodeId, trimmedName);
      setShowCodeModal(false);
      setEditingCodeId(null);
      setEditingCodeOriginalName('');
      setCodeName('');
    } catch (error) {
      console.error('Error renaming VAT code:', error);
      Alert.alert(LL.common.error(), LL.settings.vatCodeSaveError());
    }
  };

  const handleDelete = (item: VatRateModel) => {
    Alert.alert(LL.settings.vatRateDeleteTitle(), LL.settings.vatRateDeleteMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.common.delete(),
        style: 'destructive',
        onPress: () => deleteVatRate(item.id),
      },
    ]);
  };

  const handleLoadBootstrapPreview = async () => {
    if (!bootstrapCountry) {
      Alert.alert(LL.common.error(), LL.settings.vatBootstrapCountryRequired());
      return;
    }

    try {
      setIsBootstrapLoading(true);
      const preview = await fetchEuVatBootstrapPreview(bootstrapCountry);
      setBootstrapPreview(preview);
    } catch (error) {
      console.error('Error loading VAT bootstrap preview:', error);
      Alert.alert(LL.common.error(), LL.settings.vatBootstrapLoadError());
    } finally {
      setIsBootstrapLoading(false);
    }
  };

  const applyBootstrapImport = async () => {
    if (!bootstrapPreviewRows.length) return;

    const rateItems = bootstrapPreviewRows.map((rate) => ({
      codeName: rate.codeName,
      countryCode: bootstrapCountry || null,
      matchNames: [rate.displayName],
      ratePercent: rate.ratePercent,
      validFrom: rate.validFrom,
    }));

    try {
      if (bootstrapReplaceMode) {
        await replaceAllVatRates(rateItems);
      } else {
        await addVatRates(rateItems);
      }
      Alert.alert(LL.common.success(), LL.settings.vatBootstrapImportSuccess());
    } catch (error) {
      console.error('Error importing VAT bootstrap rates:', error);
      Alert.alert(LL.common.error(), LL.settings.vatBootstrapImportError());
    }
  };

  const handleApplyBootstrapImport = () => {
    if (!bootstrapPreviewRows.length) return;

    if (!bootstrapReplaceMode) {
      void applyBootstrapImport();
      return;
    }

    const hasExistingRates = vatRates.length > 0 || vatCodes.length > 0;
    if (!hasExistingRates) {
      void applyBootstrapImport();
      return;
    }

    Alert.alert(LL.settings.vatBootstrapReplaceTitle(), LL.settings.vatBootstrapReplaceMessage(), [
      { text: LL.common.cancel(), style: 'cancel' },
      {
        text: LL.settings.vatBootstrapReplaceAction(),
        style: 'destructive',
        onPress: () => {
          void applyBootstrapImport();
        },
      },
    ]);
  };

  const handleSave = async () => {
    const trimmedName = selectedRateCodeName.trim();
    if (!trimmedName) {
      Alert.alert(LL.common.error(), LL.settings.vatRateNameRequired());
      return;
    }

    if (isCreatingCodeWithFirstRate) {
      const hasDuplicateCodeName = vatCodes.some(
        (code) =>
          getLocalizedVatCodeName(code.name, LL).trim().toLocaleLowerCase() ===
          trimmedName.toLocaleLowerCase(),
      );
      if (hasDuplicateCodeName) {
        Alert.alert(LL.common.error(), LL.settings.vatCodeNameExists());
        return;
      }
    }

    const parsedRate = parseDecimalInputInRange(ratePercent, { min: 0, maxExclusive: 100 });
    if (!Number.isFinite(parsedRate)) {
      Alert.alert(LL.common.error(), LL.settings.vatRateInvalidRate());
      return;
    }

    const validFromRaw = validFrom.trim();
    const parsedFromTs = validFromRaw ? parseISODate(validFromRaw) : null;
    if (validFromRaw && parsedFromTs == null) {
      Alert.alert(LL.common.error(), LL.settings.vatRateValidFromInvalid());
      return;
    }
    const fromTs = parsedFromTs ?? VAT_VALID_FROM_BEGINNING_TS;

    const toRaw = validTo.trim();
    const toTs = toRaw ? parseISODate(toRaw) : null;
    if (toRaw && toTs == null) {
      Alert.alert(LL.common.error(), LL.settings.vatRateValidToInvalid());
      return;
    }

    if (toTs != null && toTs < fromTs) {
      Alert.alert(LL.common.error(), LL.settings.vatRateInvalidRange());
      return;
    }

    const autoClosablePreviousRate = !editingRate
      ? vatRates
          .filter((rate) => {
            if (resolveRateRawName(rate).trim().toLowerCase() !== trimmedName.toLowerCase())
              return false;
            if (rate.validTo !== undefined && rate.validTo !== null) return false;
            return rate.validFrom < fromTs;
          })
          .sort((a, b) => b.validFrom - a.validFrom)[0]
      : undefined;

    const hasOverlap = vatRates.some((rate) => {
      if (editingRate && rate.id === editingRate.id) return false;
      if (resolveRateRawName(rate).trim().toLowerCase() !== trimmedName.toLowerCase()) return false;
      if (autoClosablePreviousRate && rate.id === autoClosablePreviousRate.id) return false;

      const existingFrom = rate.validFrom;
      const existingTo = rate.validTo ?? Number.POSITIVE_INFINITY;
      const newTo = toTs ?? Number.POSITIVE_INFINITY;

      return fromTs <= existingTo && existingFrom <= newTo;
    });

    if (hasOverlap) {
      Alert.alert(LL.common.error(), LL.settings.vatRateOverlapError());
      return;
    }

    try {
      if (editingRate) {
        await updateVatRate({
          id: editingRate.id,
          codeName: trimmedName,
          ratePercent: parsedRate,
          validFrom: fromTs,
          validTo: toTs,
        });
      } else {
        await createVatRate({
          codeName: trimmedName,
          ratePercent: parsedRate,
          validFrom: fromTs,
          validTo: toTs,
        });
      }

      closeDatePicker();
      setShowModal(false);
      setEditingRate(null);
      setIsCreatingCodeWithFirstRate(false);
    } catch (error) {
      console.error('Error saving VAT rate:', error);
      Alert.alert(LL.common.error(), LL.settings.vatRateSaveError());
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: LL.settings.vatTitle(),
          headerRight: () => (
            <IconButton
              iconName="plus"
              onPress={openCreateCodeModal}
              accessibilityLabel={LL.settings.vatRateAddTitle()}
              variant={isIos ? 'ghost' : 'tint'}
              style={styles.navAddButton}
            />
          ),
        }}
      />

      <View style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={groupListStyle}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <IconSymbol name="percent" size={20} color={palette.icon} />
              <ThemedText type="subtitle">{LL.settings.vatRateTitle()}</ThemedText>
              {vatRates.length > 0 && (
                <ThemedView style={[styles.countBadge, { backgroundColor: palette.timeHighlight }]}>
                  <ThemedText style={[styles.countText, { color: palette.onHighlight }]}>
                    {vatRates.length}
                  </ThemedText>
                </ThemedView>
              )}
            </View>
          </View>

          {groupedRates.length === 0 ? (
            <ThemedText style={styles.emptyText}>{LL.settings.vatRateEmpty()}</ThemedText>
          ) : (
            groupedRates.map((group) => (
              <ThemedView
                key={group.key}
                style={[styles.groupCard, { backgroundColor: palette.cardBackground }]}
              >
                <SwipeableRow
                  onEdit={
                    group.codeId
                      ? () => openEditCodeModal(group.codeId as string, group.rawName)
                      : undefined
                  }
                  onDelete={
                    group.codeId ? () => handleDeleteCode(group.codeId as string) : undefined
                  }
                >
                  <View style={[styles.groupHeader, { backgroundColor: palette.cardBackground }]}>
                    <ThemedText type="defaultSemiBold" style={styles.groupTitle}>
                      {group.name}
                    </ThemedText>
                    <View style={styles.groupHeaderRight}>
                      <ThemedText style={styles.groupCount}>{group.rates.length}</ThemedText>
                      <Pressable
                        onPress={() => openCreateModalForCode(group.rawName)}
                        style={styles.groupAddButton}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={LL.settings.vatRateAddTitle()}
                      >
                        <IconSymbol
                          name="plus.circle.fill"
                          size={20}
                          color={palette.timeHighlight}
                        />
                      </Pressable>
                    </View>
                  </View>
                </SwipeableRow>

                <View style={[styles.tableHeader, { borderBottomColor: palette.border }]}>
                  <ThemedText style={[styles.headerCell, styles.rateCell]}>
                    {LL.settings.vatRatePercentLabel()}
                  </ThemedText>
                  <ThemedText style={[styles.headerCell, styles.dateCell]}>
                    {LL.settings.vatRateTableFrom()}
                  </ThemedText>
                  <ThemedText style={[styles.headerCell, styles.dateCell]}>
                    {LL.settings.vatRateTableTo()}
                  </ThemedText>
                </View>

                {group.rates.map((item, index) => (
                  <View key={item.id}>
                    <SwipeableRow
                      onDelete={() => handleDelete(item)}
                      onEdit={() => openEditModal(item)}
                    >
                      <View
                        style={[
                          styles.rateRow,
                          { backgroundColor: palette.cardBackground },
                          index < group.rates.length - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: palette.border,
                          },
                        ]}
                      >
                        <ThemedText
                          style={[styles.cell, styles.rateCell]}
                        >{`${item.ratePercent}%`}</ThemedText>
                        <ThemedText style={[styles.cell, styles.dateCell]}>
                          {formatValidFrom(item.validFrom)}
                        </ThemedText>
                        <ThemedText style={[styles.cell, styles.dateCell]}>
                          {item.validTo ? formatDate(item.validTo) : LL.settings.vatRateNoEnd()}
                        </ThemedText>
                      </View>
                    </SwipeableRow>
                  </View>
                ))}
              </ThemedView>
            ))
          )}

          <ThemedView
            style={[
              styles.bootstrapCard,
              {
                backgroundColor: palette.cardBackground,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.bootstrapHeader}>
              <View
                style={[styles.bootstrapIconWrap, { backgroundColor: palette.infoBadgeBackground }]}
              >
                <IconSymbol name="network" size={18} color={palette.infoBadgeText} />
              </View>
              <View style={styles.bootstrapHeaderText}>
                <ThemedText type="subtitle">{LL.settings.vatBootstrapTitle()}</ThemedText>
                <ThemedText style={[styles.bootstrapDescription, { color: palette.textSecondary }]}>
                  {LL.settings.vatBootstrapDescription()}
                </ThemedText>
              </View>
            </View>

            <ThemedText style={styles.label}>{LL.settings.vatBootstrapCountryLabel()}</ThemedText>
            <EntityPickerField
              value={bootstrapCountry}
              onValueChange={setBootstrapCountry}
              title={LL.settings.vatBootstrapCountryLabel()}
              placeholder={LL.settings.vatBootstrapCountryPlaceholder()}
              searchPlaceholder={LL.settings.vatBootstrapCountrySearchPlaceholder()}
              emptyText={LL.settings.vatBootstrapCountryEmpty()}
              emptySearchText={LL.settings.vatBootstrapCountryEmptySearch()}
              options={euCountryOptions}
            />

            <Pressable
              style={({ pressed }) => [
                styles.bootstrapButton,
                { backgroundColor: palette.tint },
                (pressed || isBootstrapLoading) && styles.pressed,
              ]}
              onPress={() => {
                void handleLoadBootstrapPreview();
              }}
              accessibilityRole="button"
              accessibilityLabel={LL.settings.vatBootstrapPreviewAction()}
            >
              <ThemedText style={[styles.bootstrapButtonText, { color: palette.onTint }]}>
                {isBootstrapLoading ? LL.common.loading() : LL.settings.vatBootstrapPreviewAction()}
              </ThemedText>
            </Pressable>

            <View style={styles.switchRow}>
              <ThemedText style={styles.switchLabel}>
                {LL.settings.vatBootstrapReplaceSwitch()}
              </ThemedText>
              <Switch
                value={bootstrapReplaceMode}
                onValueChange={setBootstrapReplaceMode}
                trackColor={switchColors.trackColor}
                ios_backgroundColor={switchColors.ios_backgroundColor}
              />
            </View>

            <ThemedText style={[styles.bootstrapHint, { color: palette.textMuted }]}>
              {LL.settings.vatBootstrapSourceHint()}
            </ThemedText>

            {bootstrapPreviewRows.length > 0 ? (
              <View
                style={[
                  styles.bootstrapPreviewCard,
                  {
                    backgroundColor: palette.backgroundSubtle,
                    borderColor: palette.border,
                  },
                ]}
              >
                <ThemedText type="defaultSemiBold">
                  {LL.settings.vatBootstrapPreviewTitle()}
                </ThemedText>
                <ThemedText
                  style={[styles.bootstrapPreviewDescription, { color: palette.textSecondary }]}
                >
                  {LL.settings.vatBootstrapPreviewMessage({
                    country: getEuMemberStateLabel(bootstrapPreview!.memberState, locale),
                    date: formatDate(bootstrapPreview!.fetchedAt),
                  })}
                </ThemedText>

                {bootstrapPreviewRows.map((rate) => (
                  <View
                    key={`${rate.kind}-${rate.ratePercent}-${rate.codeName}`}
                    style={styles.previewRow}
                  >
                    <View style={styles.previewRowText}>
                      <ThemedText type="defaultSemiBold">{rate.displayName}</ThemedText>
                      <ThemedText style={[styles.previewRowMeta, { color: palette.textMuted }]}>
                        {rate.validFrom
                          ? LL.settings.vatBootstrapValidFrom({
                              date: formatDate(rate.validFrom),
                            })
                          : LL.settings.vatRateNoStart()}
                      </ThemedText>
                    </View>
                    <ThemedView
                      style={[
                        styles.previewRateBadge,
                        { backgroundColor: palette.infoBadgeBackground },
                      ]}
                    >
                      <ThemedText
                        style={[styles.previewRateBadgeText, { color: palette.infoBadgeText }]}
                      >
                        {`${rate.ratePercent}%`}
                      </ThemedText>
                    </ThemedView>
                  </View>
                ))}

                <Pressable
                  style={({ pressed }) => [
                    styles.bootstrapApplyButton,
                    { backgroundColor: palette.success },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleApplyBootstrapImport}
                  accessibilityRole="button"
                  accessibilityLabel={LL.settings.vatBootstrapImportAction()}
                >
                  <ThemedText style={[styles.bootstrapButtonText, { color: palette.onHighlight }]}>
                    {bootstrapReplaceMode
                      ? LL.settings.vatBootstrapImportAction()
                      : LL.settings.vatBootstrapAddImportAction()}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </ThemedView>
        </ScrollView>
      </View>

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          closeDatePicker();
          setShowModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdrop }]}
          behavior={isIos ? 'padding' : 'height'}
          keyboardVerticalOffset={isIos ? 24 : 0}
        >
          <ThemedView style={styles.modalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={modalScrollContentStyle}
            >
              <ThemedText type="subtitle" style={styles.modalTitle}>
                {editingRate ? LL.settings.vatRateEditTitle() : LL.settings.vatRateAddTitle()}
              </ThemedText>

              <ThemedText style={styles.label}>{LL.settings.vatRateNameLabel()}</ThemedText>
              {isCreatingCodeWithFirstRate ? (
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: palette.text,
                      borderColor: palette.inputBorder,
                    },
                  ]}
                  placeholder={LL.settings.vatRateNamePlaceholder()}
                  placeholderTextColor={palette.placeholder}
                  value={selectedRateCodeName}
                  onChangeText={setSelectedRateCodeName}
                />
              ) : (
                <View
                  style={[
                    styles.readonlyField,
                    {
                      borderColor: palette.inputBorder,
                      backgroundColor: palette.backgroundSubtle,
                    },
                  ]}
                >
                  <ThemedText>{getLocalizedVatCodeName(selectedRateCodeName, LL)}</ThemedText>
                </View>
              )}

              <ThemedText style={styles.label}>{LL.settings.vatRatePercentLabel()}</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.inputBorder,
                  },
                ]}
                placeholder="21"
                placeholderTextColor={palette.placeholder}
                value={ratePercent}
                onChangeText={setRatePercent}
                keyboardType="decimal-pad"
              />

              <ThemedText style={styles.label}>{LL.settings.vatRateValidFromLabel()}</ThemedText>
              <View style={styles.dateFieldRow}>
                <Pressable
                  style={[
                    styles.input,
                    styles.dateFieldButton,
                    {
                      borderColor: palette.inputBorder,
                      backgroundColor: palette.inputBackground,
                    },
                  ]}
                  onPress={() => openDatePicker('from')}
                  accessibilityRole="button"
                  accessibilityLabel={LL.settings.vatRateValidFromLabel()}
                >
                  <ThemedText
                    style={[
                      styles.datePickerValue,
                      { color: validFrom ? palette.text : palette.placeholder },
                    ]}
                  >
                    {validFrom || LL.settings.vatRateNoStart()}
                  </ThemedText>
                </Pressable>
                {validFrom ? (
                  <Pressable
                    onPress={() => setValidFrom('')}
                    style={styles.dateResetButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={LL.settings.vatRateNoStart()}
                  >
                    <IconSymbol name="xmark.circle.fill" size={18} color={palette.icon} />
                  </Pressable>
                ) : null}
              </View>

              <ThemedText style={styles.label}>{LL.settings.vatRateValidToLabel()}</ThemedText>
              <View style={styles.dateFieldRow}>
                <Pressable
                  style={[
                    styles.input,
                    styles.dateFieldButton,
                    {
                      borderColor: palette.inputBorder,
                      backgroundColor: palette.inputBackground,
                    },
                  ]}
                  onPress={() => openDatePicker('to')}
                  accessibilityRole="button"
                  accessibilityLabel={LL.settings.vatRateValidToLabel()}
                >
                  <ThemedText
                    style={[
                      styles.datePickerValue,
                      { color: validTo ? palette.text : palette.placeholder },
                    ]}
                  >
                    {validTo || LL.settings.vatRateNoEnd()}
                  </ThemedText>
                </Pressable>
                {validTo ? (
                  <Pressable
                    onPress={() => setValidTo('')}
                    style={styles.dateResetButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={LL.settings.vatRateNoEnd()}
                  >
                    <IconSymbol name="xmark.circle.fill" size={18} color={palette.icon} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.modalButtons}>
                <Pressable
                  style={[
                    styles.button,
                    styles.cancelButton,
                    { backgroundColor: palette.buttonNeutralBackground },
                  ]}
                  onPress={() => {
                    closeDatePicker();
                    setShowModal(false);
                  }}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                    {LL.common.cancel()}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.confirmButton, { backgroundColor: palette.tint }]}
                  onPress={handleSave}
                >
                  <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                    {LL.common.save()}
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </ThemedView>
          <CrossPlatformDatePicker
            visible={!!activeDateField}
            value={pickerDate}
            title={
              activeDateField === 'from'
                ? LL.settings.vatRateValidFromLabel()
                : LL.settings.vatRateValidToLabel()
            }
            cancelLabel={LL.common.cancel()}
            confirmLabel={LL.common.save()}
            onCancel={closeDatePicker}
            onValueChange={setPickerDate}
            onConfirm={(selectedDate) => {
              if (!activeDateField) return;
              applyDate(activeDateField, selectedDate);
              closeDatePicker();
            }}
          />
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCodeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCodeModal(false);
          setEditingCodeId(null);
          setEditingCodeOriginalName('');
          setCodeName('');
        }}
      >
        <KeyboardAvoidingView
          style={[styles.modalOverlay, { backgroundColor: palette.overlayBackdrop }]}
          behavior={isIos ? 'padding' : 'height'}
          keyboardVerticalOffset={isIos ? 24 : 0}
        >
          <ThemedView style={styles.modalContent}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={modalScrollContentStyle}
            >
              <ThemedText type="subtitle" style={styles.modalTitle}>
                {LL.settings.vatCodeEditTitle()}
              </ThemedText>

              <ThemedText style={styles.label}>{LL.settings.vatRateNameLabel()}</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.inputBorder,
                  },
                ]}
                placeholder={LL.settings.vatRateNamePlaceholder()}
                placeholderTextColor={palette.placeholder}
                value={codeName}
                onChangeText={setCodeName}
              />

              <View style={styles.modalButtons}>
                <Pressable
                  style={[
                    styles.button,
                    styles.cancelButton,
                    { backgroundColor: palette.buttonNeutralBackground },
                  ]}
                  onPress={() => {
                    setShowCodeModal(false);
                    setEditingCodeId(null);
                    setEditingCodeOriginalName('');
                    setCodeName('');
                  }}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                    {LL.common.cancel()}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.confirmButton, { backgroundColor: palette.tint }]}
                  onPress={handleSaveCode}
                >
                  <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
                    {LL.common.save()}
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </ThemedView>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  bootstrapCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  bootstrapHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bootstrapIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootstrapHeaderText: {
    flex: 1,
    gap: 4,
  },
  bootstrapDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  bootstrapButton: {
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  bootstrapApplyButton: {
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  bootstrapButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  bootstrapHint: {
    fontSize: 12,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    flex: 1,
  },
  bootstrapPreviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  bootstrapPreviewDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewRowText: {
    flex: 1,
    gap: 2,
  },
  previewRowMeta: {
    fontSize: 12,
  },
  previewRateBadge: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRateBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  navAddButton: {
    marginRight: 6,
  },
  readonlyField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
    marginTop: 8,
  },
  groupList: {
    paddingBottom: 24,
    gap: 12,
  },
  groupCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  groupHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTitle: {
    flex: 1,
  },
  groupHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupCount: {
    opacity: 0.65,
    fontSize: 12,
    fontWeight: '600',
  },
  groupAddButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeader: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerCell: {
    opacity: 0.65,
    fontSize: 12,
    fontWeight: '600',
  },
  rateRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cell: {
    fontSize: 14,
  },
  rateCell: {
    width: 72,
  },
  dateCell: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 12,
    maxWidth: 420,
    maxHeight: '84%',
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalTitle: { marginBottom: 20 },
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
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateFieldButton: {
    flex: 1,
  },
  datePickerValue: {
    fontSize: 16,
  },
  dateResetButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {},
  confirmButton: { justifyContent: 'center' },
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
