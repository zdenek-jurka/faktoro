import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import database from '@/db';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import { normalizeIntlLocale } from '@/i18n/locale-options';
import CurrencySettingModel from '@/model/CurrencySettingModel';
import {
  CURRENCY_SETTING_IN_USE,
  CURRENCY_SETTING_LAST_REMAINING,
  CURRENCY_SETTING_DUPLICATE_CODE,
  deleteCurrencySetting,
  upsertCurrencySetting,
} from '@/repositories/currency-settings-repository';
import { normalizeCurrencyCode } from '@/utils/currency-utils';
import { formatPriceValue } from '@/utils/price-utils';
import { isIos } from '@/utils/platform';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

type CurrencyFormState = {
  id?: string;
  code: string;
  prefix: string;
  suffix: string;
};

const EMPTY_FORM: CurrencyFormState = {
  code: '',
  prefix: '',
  suffix: '',
};

export default function SettingsCurrencyFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const palette = usePalette();
  const { LL, locale } = useI18nContext();
  const intlLocale = normalizeIntlLocale(locale, 'en');
  const headerHeight = useHeaderHeight();
  const contentStyle = useBottomSafeAreaStyle(styles.content);
  const [form, setForm] = useState<CurrencyFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const routerRef = useRef(router);
  const llRef = useRef(LL);

  const isEditingExisting = !!form.id;

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    llRef.current = LL;
  }, [LL]);

  useEffect(() => {
    let isCancelled = false;

    if (!id) {
      setForm(EMPTY_FORM);
      return;
    }

    void (async () => {
      try {
        const currency = await database
          .get<CurrencySettingModel>(CurrencySettingModel.table)
          .find(id);
        if (isCancelled) return;
        setForm({
          id: currency.id,
          code: currency.code,
          prefix: currency.prefix || '',
          suffix: currency.suffix || '',
        });
      } catch (error) {
        console.error('Error loading currency setting:', error);
        if (isCancelled) return;
        Alert.alert(llRef.current.common.error(), llRef.current.settings.saveError());
        routerRef.current.back();
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  const preview = useMemo(() => {
    const code = normalizeCurrencyCode(form.code);
    const value = formatPriceValue(1234.56, intlLocale);
    return `${form.prefix}${value}${form.suffix || ` ${code}`}`;
  }, [form.code, form.prefix, form.suffix, intlLocale]);

  const handleSave = async () => {
    const normalizedCode = normalizeCurrencyCode(form.code);
    if (!normalizedCode.trim()) {
      Alert.alert(LL.common.error(), LL.settings.currencyCodeHelp());
      return;
    }

    try {
      setIsSaving(true);
      await upsertCurrencySetting({
        id: form.id,
        code: normalizedCode,
        prefix: form.prefix,
        suffix: form.suffix,
        isActive: true,
      });
      router.back();
    } catch (error) {
      const message =
        error instanceof Error && error.message === CURRENCY_SETTING_DUPLICATE_CODE
          ? LL.settings.currencyDuplicateCode()
          : LL.settings.saveError();
      Alert.alert(LL.common.error(), message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!form.id) return;

    Alert.alert(
      LL.settings.currencyDeleteTitle(),
      LL.settings.currencyDeleteMessage({ code: form.code || '---' }),
      [
        { text: LL.common.cancel(), style: 'cancel' },
        {
          text: LL.settings.currencyDeleteConfirm(),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteCurrencySetting(form.id!);
                router.back();
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
          title: isEditingExisting ? LL.settings.editCurrency() : LL.settings.addCurrency(),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={isIos ? 'padding' : undefined}
        keyboardVerticalOffset={isIos ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
          <ThemedView style={[styles.sectionCard, { backgroundColor: palette.cardBackground }]}>
            <ThemedText style={styles.label}>{LL.settings.currencyCodeLabel()}</ThemedText>
            <ThemedText style={styles.hintText}>{LL.settings.currencyCodeHelp()}</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: palette.inputBorder,
                  backgroundColor: palette.inputBackground,
                },
              ]}
              value={form.code}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, code: value.toUpperCase() }))
              }
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              editable={!isEditingExisting}
              placeholder="EUR"
              placeholderTextColor={palette.placeholder}
            />

            <ThemedText style={styles.label}>{LL.settings.currencyPrefixLabel()}</ThemedText>
            <ThemedText style={styles.hintText}>{LL.settings.currencyPrefixHelp()}</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: palette.inputBorder,
                  backgroundColor: palette.inputBackground,
                },
              ]}
              value={form.prefix}
              onChangeText={(value) => setForm((current) => ({ ...current, prefix: value }))}
              placeholder="€"
              placeholderTextColor={palette.placeholder}
            />

            <ThemedText style={styles.label}>{LL.settings.currencySuffixLabel()}</ThemedText>
            <ThemedText style={styles.hintText}>{LL.settings.currencySuffixHelp()}</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: palette.inputBorder,
                  backgroundColor: palette.inputBackground,
                },
              ]}
              value={form.suffix}
              onChangeText={(value) => setForm((current) => ({ ...current, suffix: value }))}
              placeholder=" Kč"
              placeholderTextColor={palette.placeholder}
            />

            <ThemedText style={styles.label}>{LL.settings.currencyPreviewLabel()}</ThemedText>
            <ThemedView
              style={[
                styles.previewCard,
                { borderColor: palette.border, backgroundColor: palette.backgroundSubtle },
              ]}
            >
              <ThemedText type="defaultSemiBold">{preview}</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.formActions}>
            <Pressable
              style={[
                styles.cancelButton,
                {
                  backgroundColor: palette.buttonNeutralBackground,
                },
              ]}
              onPress={() => router.back()}
            >
              <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
                {LL.common.cancel()}
              </ThemedText>
            </Pressable>

            <Pressable
              style={[styles.saveButton, { backgroundColor: palette.tint }]}
              onPress={() => void handleSave()}
              disabled={isSaving}
            >
              <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
                {isSaving ? LL.common.loading() : LL.common.save()}
              </ThemedText>
            </Pressable>
          </ThemedView>

          {isEditingExisting ? (
            <Pressable
              style={[
                styles.deleteButton,
                {
                  backgroundColor: palette.destructive,
                },
              ]}
              onPress={handleDelete}
            >
              <ThemedText style={[styles.deleteButtonText, { color: palette.onDestructive }]}>
                {LL.settings.currencyDeleteConfirm()}
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  sectionCard: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  label: { fontSize: 13, opacity: 0.72 },
  hintText: { fontSize: 12, opacity: 0.58, marginTop: -6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  saveButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: { fontSize: 16, fontWeight: '700' },
  deleteButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
