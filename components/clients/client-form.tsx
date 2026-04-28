import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getLocaleOptions } from '@/i18n/locale-options';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSwitchColors } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  INVOICE_PAYMENT_METHOD_OPTIONS,
  normalizeInvoicePaymentMethod,
} from '@/utils/invoice-defaults';
import { normalizeTimerLimitMode } from '@/utils/timer-limit-utils';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { ClientFormData } from './client-types';

interface ClientFormProps {
  formData: ClientFormData;
  onFormDataChange: (data: ClientFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onLookupByCompanyId?: (companyId: string) => void;
  onLookupRegistryPicker?: (companyId: string) => void;
  isLookupLoading?: boolean;
  isSubmitting?: boolean;
  isEditMode?: boolean;
  isScreen?: boolean;
}

export function ClientForm({
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  onDelete,
  onLookupByCompanyId,
  onLookupRegistryPicker,
  isLookupLoading = false,
  isSubmitting = false,
  isEditMode = false,
  isScreen = false,
}: ClientFormProps) {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const defaultQrLabel = LL.clients.default();
  const defaultXmlLabel = LL.clients.default();
  const defaultPaymentMethodLabel = LL.clients.default();
  const defaultDueDaysLabel = LL.clients.default();
  const timerLimitMode = normalizeTimerLimitMode(formData.timerLimitMode);

  const updateField = (field: keyof ClientFormData, value: string | boolean) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const getPaymentMethodLabel = (value: string) => {
    switch (normalizeInvoicePaymentMethod(value)) {
      case 'cash':
        return LL.invoices.paymentMethodCash();
      case 'card':
        return LL.invoices.paymentMethodCard();
      case 'card_nfc':
        return LL.invoices.paymentMethodCardNfc();
      case 'bank_transfer':
      default:
        return LL.invoices.paymentMethodBankTransfer();
    }
  };

  const handleIsCompanyToggle = () => {
    const newIsCompany = !formData.isCompany;
    onFormDataChange({
      ...formData,
      isCompany: newIsCompany,
      isVatPayer: newIsCompany ? formData.isVatPayer : false,
      vatNumber: newIsCompany || formData.isVatPayer ? formData.vatNumber : '',
      companyId: newIsCompany ? formData.companyId : '',
    });
  };

  const handleIsVatPayerToggle = () => {
    updateField('isVatPayer', !formData.isVatPayer);
  };

  return (
    <ThemedView
      style={[
        isScreen ? styles.formContainerScreen : styles.formContainer,
        { borderColor: palette.inputBorder },
      ]}
    >
      <ThemedText type="subtitle" style={styles.formTitle}>
        {isEditMode ? LL.clients.editClient() : LL.clients.addNew()}
      </ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.clientName() + ' *'}
        placeholderTextColor={palette.placeholder}
        value={formData.name}
        onChangeText={(text) => updateField('name', text)}
        accessibilityLabel={`${LL.clients.clientName()} *`}
      />

      <View style={styles.switchRow}>
        <ThemedText style={styles.switchLabel}>{LL.clients.isCompany()}</ThemedText>
        <Switch
          value={formData.isCompany}
          onValueChange={handleIsCompanyToggle}
          {...getSwitchColors(palette)}
          accessibilityLabel={LL.clients.isCompany()}
        />
      </View>

      {formData.isCompany && (
        <>
          <TextInput
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: palette.inputBorder,
              },
            ]}
            placeholder={LL.clients.companyId()}
            placeholderTextColor={palette.placeholder}
            value={formData.companyId}
            onChangeText={(text) => updateField('companyId', text)}
            accessibilityLabel={LL.clients.companyId()}
          />
          {onLookupByCompanyId && (
            <View
              style={[
                styles.lookupSplitButton,
                {
                  borderColor: palette.tint,
                  opacity: isLookupLoading ? 0.7 : 1,
                },
              ]}
            >
              <Pressable
                style={styles.lookupPrimaryButton}
                onPress={() => onLookupByCompanyId(formData.companyId)}
                disabled={isLookupLoading || isSubmitting}
              >
                {isLookupLoading ? (
                  <ActivityIndicator size="small" color={palette.tint} />
                ) : (
                  <ThemedText style={[styles.lookupButtonText, { color: palette.tint }]}>
                    {LL.clients.lookupCompanyById()}
                  </ThemedText>
                )}
              </Pressable>
              {onLookupRegistryPicker && (
                <Pressable
                  style={[
                    styles.lookupArrowButton,
                    {
                      borderLeftColor: palette.tint,
                    },
                  ]}
                  onPress={() => onLookupRegistryPicker(formData.companyId)}
                  disabled={isLookupLoading || isSubmitting}
                  accessibilityRole="button"
                  accessibilityLabel={LL.clients.lookupCompanyById()}
                >
                  <IconSymbol name="chevron.down" size={16} color={palette.tint} />
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.switchRow}>
            <ThemedText style={styles.switchLabel}>{LL.clients.isVatPayer()}</ThemedText>
            <Switch
              value={formData.isVatPayer}
              onValueChange={handleIsVatPayerToggle}
              {...getSwitchColors(palette)}
              accessibilityLabel={LL.clients.isVatPayer()}
            />
          </View>

          {formData.isVatPayer && (
            <TextInput
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: palette.inputBorder,
                },
              ]}
              placeholder={LL.clients.vatNumber() + ' *'}
              placeholderTextColor={palette.placeholder}
              value={formData.vatNumber}
              onChangeText={(text) => updateField('vatNumber', text)}
              accessibilityLabel={`${LL.clients.vatNumber()} *`}
            />
          )}
        </>
      )}

      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.email()}
        placeholderTextColor={palette.placeholder}
        value={formData.email}
        onChangeText={(text) => updateField('email', text)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="emailAddress"
        autoComplete="email"
        accessibilityLabel={LL.clients.email()}
      />
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.phone()}
        placeholderTextColor={palette.placeholder}
        value={formData.phone}
        onChangeText={(text) => updateField('phone', text)}
        keyboardType="phone-pad"
        accessibilityLabel={LL.clients.phone()}
      />

      <TextInput
        style={[
          styles.input,
          styles.textArea,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={LL.clients.notes()}
        placeholderTextColor={palette.placeholder}
        value={formData.notes}
        onChangeText={(text) => updateField('notes', text)}
        multiline
        numberOfLines={3}
        accessibilityLabel={LL.clients.notes()}
      />

      <ThemedText style={styles.sectionTitle}>{LL.clients.billingSettings()}</ThemedText>

      <View style={styles.switchRow}>
        <ThemedText style={styles.switchLabel}>{LL.clients.roundTimeByInterval()}</ThemedText>
        <Switch
          value={formData.billingIntervalEnabled}
          onValueChange={(value) => updateField('billingIntervalEnabled', value)}
          {...getSwitchColors(palette)}
          accessibilityLabel={LL.clients.roundTimeByInterval()}
        />
      </View>

      {formData.billingIntervalEnabled && (
        <View style={styles.intervalRow}>
          <ThemedText style={styles.intervalLabel}>{LL.clients.intervalMinutes()}</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.intervalInput,
              {
                color: palette.text,
                borderColor: palette.inputBorder,
              },
            ]}
            placeholder="15"
            placeholderTextColor={palette.placeholder}
            value={formData.billingIntervalMinutes}
            onChangeText={(text) => updateField('billingIntervalMinutes', text)}
            keyboardType="numeric"
            accessibilityLabel={LL.clients.intervalMinutes()}
          />
        </View>
      )}

      <ThemedText style={styles.sectionTitle}>{LL.settings.timerLimitsTitle()}</ThemedText>
      <ThemedText style={styles.helperText}>{LL.settings.timerLimitsDescription()}</ThemedText>
      <ThemedText style={styles.fieldLabel}>{LL.clients.timerLimitMode()}</ThemedText>
      <Select
        value={timerLimitMode}
        onValueChange={(value) => updateField('timerLimitMode', value)}
      >
        <SelectTrigger>
          <SelectValue placeholder={LL.clients.timerLimitModeDefault()} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{LL.clients.timerLimitMode()}</SelectLabel>
            <SelectItem value="default" label={LL.clients.timerLimitModeDefault()}>
              {LL.clients.timerLimitModeDefault()}
            </SelectItem>
            <SelectItem value="custom" label={LL.clients.timerLimitModeCustom()}>
              {LL.clients.timerLimitModeCustom()}
            </SelectItem>
            <SelectItem value="disabled" label={LL.clients.timerLimitModeDisabled()}>
              {LL.clients.timerLimitModeDisabled()}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {timerLimitMode === 'custom' && (
        <>
          <ThemedText style={styles.helperText}>{LL.clients.timerLimitCustomHelp()}</ThemedText>
          <ThemedText style={styles.fieldLabel}>{LL.settings.timerSoftLimitHours()}</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: palette.inputBorder,
              },
            ]}
            placeholder={LL.settings.timerSoftLimitHoursPlaceholder()}
            placeholderTextColor={palette.placeholder}
            value={formData.timerSoftLimitHours}
            onChangeText={(text) => updateField('timerSoftLimitHours', text)}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={LL.settings.timerSoftLimitHours()}
          />
          <ThemedText style={styles.fieldLabel}>{LL.settings.timerHardLimitHours()}</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: palette.inputBorder,
              },
            ]}
            placeholder={LL.settings.timerHardLimitHoursPlaceholder()}
            placeholderTextColor={palette.placeholder}
            value={formData.timerHardLimitHours}
            onChangeText={(text) => updateField('timerHardLimitHours', text)}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={LL.settings.timerHardLimitHours()}
          />
        </>
      )}

      <ThemedText style={styles.fieldLabel}>{LL.clients.exportLanguage()}</ThemedText>
      <Select
        value={formData.exportLanguage || 'app'}
        onValueChange={(value) => updateField('exportLanguage', value === 'app' ? '' : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder={LL.clients.exportLanguageUseApp()} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{LL.clients.exportLanguage()}</SelectLabel>
            <SelectItem value="app" label={LL.clients.exportLanguageUseApp()}>
              {LL.clients.exportLanguageUseApp()}
            </SelectItem>
            {getLocaleOptions().map((localeOption) => (
              <SelectItem
                key={localeOption.value}
                value={localeOption.value}
                label={localeOption.label}
              >
                {localeOption.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <ThemedText style={styles.fieldLabel}>{LL.settings.defaultInvoicePaymentMethod()}</ThemedText>
      <Select
        value={formData.invoicePaymentMethod || 'default'}
        onValueChange={(value) =>
          updateField('invoicePaymentMethod', value === 'default' ? '' : value)
        }
      >
        <SelectTrigger>
          <SelectValue placeholder={defaultPaymentMethodLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{LL.settings.defaultInvoicePaymentMethod()}</SelectLabel>
            <SelectItem value="default" label={defaultPaymentMethodLabel}>
              {defaultPaymentMethodLabel}
            </SelectItem>
            {INVOICE_PAYMENT_METHOD_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} label={getPaymentMethodLabel(option)}>
                {getPaymentMethodLabel(option)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <ThemedText style={styles.fieldLabel}>{LL.settings.defaultInvoiceDueDays()}</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.inputBorder,
          },
        ]}
        placeholder={defaultDueDaysLabel}
        placeholderTextColor={palette.placeholder}
        value={formData.invoiceDueDays}
        onChangeText={(text) => updateField('invoiceDueDays', text)}
        keyboardType="numeric"
        accessibilityLabel={LL.settings.defaultInvoiceDueDays()}
      />

      <ThemedText style={styles.fieldLabel}>{LL.settings.invoiceQrType()}</ThemedText>
      <Select
        value={formData.invoiceQrType || 'default'}
        onValueChange={(value) => updateField('invoiceQrType', value === 'default' ? '' : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder={defaultQrLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{LL.settings.invoiceQrType()}</SelectLabel>
            <SelectItem value="default" label={defaultQrLabel}>
              {defaultQrLabel}
            </SelectItem>
            <SelectItem value="none" label={LL.settings.invoiceQrTypeNone()}>
              {LL.settings.invoiceQrTypeNone()}
            </SelectItem>
            <SelectItem value="spayd" label={LL.settings.invoiceQrTypeSpayd()}>
              {LL.settings.invoiceQrTypeSpayd()}
            </SelectItem>
            <SelectItem value="epc" label={LL.settings.invoiceQrTypeEpc()}>
              {LL.settings.invoiceQrTypeEpc()}
            </SelectItem>
            <SelectItem value="swiss" label={LL.settings.invoiceQrTypeSwiss()}>
              {LL.settings.invoiceQrTypeSwiss()}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <ThemedText style={styles.fieldLabel}>{LL.settings.invoiceDefaultExportFormat()}</ThemedText>
      <Select
        value={formData.invoiceDefaultExportFormat || 'default'}
        onValueChange={(value) =>
          updateField('invoiceDefaultExportFormat', value === 'default' ? '' : value)
        }
      >
        <SelectTrigger>
          <SelectValue placeholder={defaultXmlLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{LL.settings.invoiceDefaultExportFormat()}</SelectLabel>
            <SelectItem value="default" label={defaultXmlLabel}>
              {defaultXmlLabel}
            </SelectItem>
            <SelectItem value="none" label={LL.settings.invoiceDefaultExportFormatNone()}>
              {LL.settings.invoiceDefaultExportFormatNone()}
            </SelectItem>
            <SelectItem value="isdoc" label={LL.invoices.exportIsdoc()}>
              {LL.invoices.exportIsdoc()}
            </SelectItem>
            <SelectItem value="peppol" label={LL.invoices.exportPeppol()}>
              {LL.invoices.exportPeppol()}
            </SelectItem>
            <SelectItem value="xrechnung" label={LL.invoices.exportXrechnung()}>
              {LL.invoices.exportXrechnung()}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <View style={styles.formActions}>
        <Pressable
          style={[
            styles.button,
            styles.cancelButton,
            { backgroundColor: palette.buttonNeutralBackground, opacity: isSubmitting ? 0.7 : 1 },
          ]}
          onPress={onCancel}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={LL.common.cancel()}
        >
          <ThemedText style={[styles.cancelButtonText, { color: palette.textMuted }]}>
            {LL.common.cancel()}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            { backgroundColor: palette.tint, opacity: isSubmitting ? 0.75 : 1 },
          ]}
          onPress={onSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={LL.common.save()}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={palette.onTint} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
              {LL.common.save()}
            </ThemedText>
          )}
        </Pressable>
      </View>
      {isEditMode && onDelete && (
        <Pressable
          style={[styles.button, styles.deleteButton, { backgroundColor: palette.destructive }]}
          onPress={onDelete}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={LL.common.delete()}
        >
          <ThemedText style={[styles.deleteButtonText, { color: palette.onDestructive }]}>
            {LL.common.delete()}
          </ThemedText>
        </Pressable>
      )}

      {isSubmitting ? (
        <View
          style={[
            styles.loadingOverlay,
            {
              backgroundColor: `${palette.background}E8`,
            },
          ]}
          pointerEvents="auto"
        >
          <ActivityIndicator size="large" color={palette.tint} />
          <ThemedText style={styles.loadingOverlayText}>{LL.common.loading()}</ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    position: 'relative',
  },
  formContainerScreen: {
    width: '100%',
    position: 'relative',
  },
  formTitle: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 13,
    marginBottom: 12,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  halfInput: {
    flex: 1,
    marginHorizontal: 4,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 16,
    flex: 1,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  intervalLabel: {
    fontSize: 16,
    minWidth: 120,
  },
  intervalInput: {
    flex: 1,
    marginBottom: 0,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  lookupSplitButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  lookupButtonText: {
    fontWeight: '600',
  },
  lookupPrimaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
  },
  lookupArrowButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    paddingHorizontal: 0,
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {},
  cancelButtonText: {
    fontWeight: '600',
  },
  buttonText: {
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 12,
  },
  deleteButtonText: {
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 12,
  },
  loadingOverlayText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
