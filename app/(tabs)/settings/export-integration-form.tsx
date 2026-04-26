import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontSizes, Spacing } from '@/constants/theme';
import { useBottomSafeAreaStyle } from '@/hooks/use-bottom-safe-area-style';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  type ExportIntegration,
  type ExportIntegrationDelivery,
  type ExportIntegrationDocumentType,
  type WebhookAuth,
  type WebhookHeader,
  createExportIntegration,
  getExportIntegrations,
  testExportIntegrationDelivery,
  testExportIntegrationTransform,
  updateExportIntegration,
  validateExportIntegrationXslt,
} from '@/repositories/export-integration-repository';
import { getExportIntegrationErrorMessage } from '@/utils/error-utils';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

const DOCUMENT_TYPES: ExportIntegrationDocumentType[] = ['timesheet', 'invoice'];
const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH'] as const;
type DeliveryType = 'share' | 'clipboard' | 'webhook';
type AuthType = 'none' | 'bearer' | 'api_key' | 'basic' | 'oauth2_cc';
const AUTH_TYPES: AuthType[] = ['none', 'bearer', 'api_key', 'basic', 'oauth2_cc'];

function isSecureOrLocalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalhost);
  } catch {
    return false;
  }
}

export default function ExportIntegrationFormScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const router = useRouter();
  const { integrationId } = useLocalSearchParams<{ integrationId?: string }>();
  const contentStyle = useBottomSafeAreaStyle(styles.content);

  const isEdit = !!integrationId;

  // Core fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<ExportIntegrationDocumentType | null>(null);
  const [xslt, setXslt] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingAction, setTestingAction] = useState<'transform' | 'delivery' | null>(null);

  // Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('share');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMethod, setWebhookMethod] = useState<'POST' | 'PUT' | 'PATCH'>('POST');
  const [webhookContentType, setWebhookContentType] = useState('application/xml');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [bearerToken, setBearerToken] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');
  const [oauth2TokenUrl, setOauth2TokenUrl] = useState('');
  const [oauth2ClientId, setOauth2ClientId] = useState('');
  const [oauth2ClientSecret, setOauth2ClientSecret] = useState('');
  const [oauth2Scope, setOauth2Scope] = useState('');
  const [extraHeaders, setExtraHeaders] = useState<WebhookHeader[]>([]);

  useEffect(() => {
    if (!integrationId) return;
    const load = async () => {
      const all = await getExportIntegrations();
      const found = all.find((i) => i.id === integrationId);
      if (!found) return;
      setName(found.name);
      setDescription(found.description || '');
      setDocumentType(found.documentType);
      setXslt(found.xslt);

      const d = found.delivery;
      if (d.type === 'webhook') {
        setDeliveryType('webhook');
        setWebhookUrl(d.url);
        setWebhookMethod(d.method);
        setWebhookContentType(d.contentType);
        setExtraHeaders(d.headers ?? []);
        const auth = d.auth;
        setAuthType(auth.type);
        if (auth.type === 'bearer') {
          setBearerToken(auth.token);
        } else if (auth.type === 'api_key') {
          setApiKeyHeader(auth.headerName);
          setApiKeyValue(auth.value);
        } else if (auth.type === 'basic') {
          setBasicUsername(auth.username);
          setBasicPassword(auth.password);
        } else if (auth.type === 'oauth2_cc') {
          setOauth2TokenUrl(auth.tokenUrl);
          setOauth2ClientId(auth.clientId);
          setOauth2ClientSecret(auth.clientSecret);
          setOauth2Scope(auth.scope);
        }
      } else {
        setDeliveryType(d.type);
      }
    };
    void load();
  }, [integrationId]);

  const getTypeLabel = (type: ExportIntegrationDocumentType) => {
    if (type === 'timesheet') return LL.settings.exportIntegrationDocumentTypeTimesheet();
    return LL.settings.exportIntegrationDocumentTypeInvoice();
  };

  const getAuthTypeLabel = (type: AuthType): string => {
    switch (type) {
      case 'none':
        return LL.settings.exportIntegrationWebhookAuthNone();
      case 'bearer':
        return LL.settings.exportIntegrationWebhookAuthBearer();
      case 'api_key':
        return LL.settings.exportIntegrationWebhookAuthApiKey();
      case 'basic':
        return LL.settings.exportIntegrationWebhookAuthBasic();
      case 'oauth2_cc':
        return LL.settings.exportIntegrationWebhookAuthOauth2CC();
    }
  };

  const handleLoadFromFile = async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentPicker = require('expo-document-picker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy');

    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/xml', 'application/xml', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    try {
      const content: string = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
      });
      setXslt(content);
    } catch (error) {
      console.error('Failed to read XSLT file:', error);
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationLoadFileError());
    }
  };

  const addHeader = () => {
    setExtraHeaders((prev) => [...prev, { key: '', value: '' }]);
  };

  const updateHeader = (index: number, field: 'key' | 'value', text: string) => {
    setExtraHeaders((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: text };
      return next;
    });
  };

  const removeHeader = (index: number) => {
    setExtraHeaders((prev) => prev.filter((_, i) => i !== index));
  };

  const buildDelivery = (): ExportIntegrationDelivery | null => {
    if (deliveryType === 'share') return { type: 'share' };
    if (deliveryType === 'clipboard') return { type: 'clipboard' };

    // webhook — validate first
    if (!webhookUrl.trim()) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookUrlRequired());
      return null;
    }
    if (!isSecureOrLocalUrl(webhookUrl.trim())) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookHttpsRequired());
      return null;
    }
    if (authType === 'bearer' && !bearerToken.trim()) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookBearerRequired());
      return null;
    }
    if (authType === 'api_key' && (!apiKeyHeader.trim() || !apiKeyValue.trim())) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookApiKeyRequired());
      return null;
    }
    if (authType === 'basic' && (!basicUsername.trim() || !basicPassword.trim())) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookBasicRequired());
      return null;
    }
    if (
      authType === 'oauth2_cc' &&
      (!oauth2TokenUrl.trim() || !oauth2ClientId.trim() || !oauth2ClientSecret.trim())
    ) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookOauth2Required());
      return null;
    }
    if (authType === 'oauth2_cc' && !isSecureOrLocalUrl(oauth2TokenUrl.trim())) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookOauth2HttpsRequired());
      return null;
    }

    let auth: WebhookAuth;
    if (authType === 'bearer') {
      auth = { type: 'bearer', token: bearerToken.trim() };
    } else if (authType === 'api_key') {
      auth = { type: 'api_key', headerName: apiKeyHeader.trim(), value: apiKeyValue.trim() };
    } else if (authType === 'basic') {
      auth = { type: 'basic', username: basicUsername.trim(), password: basicPassword.trim() };
    } else if (authType === 'oauth2_cc') {
      auth = {
        type: 'oauth2_cc',
        tokenUrl: oauth2TokenUrl.trim(),
        clientId: oauth2ClientId.trim(),
        clientSecret: oauth2ClientSecret.trim(),
        scope: oauth2Scope.trim(),
      };
    } else {
      auth = { type: 'none' };
    }

    return {
      type: 'webhook',
      url: webhookUrl.trim(),
      method: webhookMethod,
      contentType: webhookContentType.trim() || 'application/xml',
      auth,
      headers: extraHeaders.filter((h) => h.key.trim()),
    };
  };

  const buildDraftIntegration = (): ExportIntegration | null => {
    if (!documentType) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationDocumentTypeRequired());
      return null;
    }

    const delivery = buildDelivery();
    if (!delivery) return null;

    return {
      id: integrationId || 'draft-export-integration',
      name: name.trim() || LL.settings.exportIntegrationDraftName(),
      description: description.trim(),
      documentType,
      delivery,
      xslt: xslt.trim(),
      createdAt: Date.now(),
    };
  };

  const handleTestTransform = async () => {
    if (!documentType) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationDocumentTypeRequired());
      return;
    }
    if (!xslt.trim()) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationXsltRequired());
      return;
    }

    try {
      setTestingAction('transform');
      await testExportIntegrationTransform(documentType, xslt.trim());
      Alert.alert(LL.common.success(), LL.settings.exportIntegrationTestTransformSuccess());
    } catch (error) {
      console.error('Error testing export transform:', error);
      const message = getExportIntegrationErrorMessage(
        error,
        LL,
        LL.settings.exportIntegrationXsltInvalid(),
      );
      Alert.alert(LL.common.error(), message);
    } finally {
      setTestingAction(null);
    }
  };

  const handleTestDelivery = async () => {
    if (!xslt.trim()) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationXsltRequired());
      return;
    }

    const integration = buildDraftIntegration();
    if (!integration) return;

    try {
      setTestingAction('delivery');
      const result = await testExportIntegrationDelivery(integration);
      if (result.outcome === 'copied') {
        Alert.alert(
          LL.common.success(),
          LL.settings.exportIntegrationTestDeliveryClipboardSuccess(),
        );
      } else if (result.outcome === 'sent') {
        Alert.alert(
          LL.common.success(),
          LL.settings.exportIntegrationTestDeliveryWebhookSuccess({ status: result.status }),
        );
      } else {
        Alert.alert(LL.common.success(), LL.settings.exportIntegrationTestDeliveryShareSuccess());
      }
    } catch (error) {
      console.error('Error testing export delivery:', error);
      const isHttpError = error instanceof Error && 'httpStatus' in error;
      const isNetworkError = error instanceof Error && 'networkError' in error;
      const message = isHttpError
        ? LL.settings.exportIntegrationTestDeliveryWebhookError({
            status: (error as Error & { httpStatus: number }).httpStatus,
          })
        : isNetworkError
          ? LL.settings.exportIntegrationTestDeliveryNetworkError()
          : getExportIntegrationErrorMessage(
              error,
              LL,
              LL.settings.exportIntegrationTestDeliveryError(),
            );
      Alert.alert(LL.common.error(), message);
    } finally {
      setTestingAction(null);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedXslt = xslt.trim();

    if (!trimmedName) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationNameRequired());
      return;
    }
    if (!documentType) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationDocumentTypeRequired());
      return;
    }
    if (!trimmedXslt) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationXsltRequired());
      return;
    }

    const delivery = buildDelivery();
    if (!delivery) return; // validation failed inside buildDelivery

    try {
      await validateExportIntegrationXslt(documentType, trimmedXslt);
    } catch (error) {
      console.error('Invalid XSLT integration:', error);
      const validationMessage = error instanceof Error && error.message ? `\n${error.message}` : '';
      Alert.alert(
        LL.common.error(),
        `${LL.settings.exportIntegrationXsltInvalid()}${validationMessage}`,
      );
      return;
    }

    try {
      setSaving(true);
      if (isEdit && integrationId) {
        await updateExportIntegration(integrationId, {
          name: trimmedName,
          description: trimmedDescription,
          documentType,
          delivery,
          xslt: trimmedXslt,
        });
      } else {
        await createExportIntegration({
          name: trimmedName,
          description: trimmedDescription,
          documentType,
          delivery,
          xslt: trimmedXslt,
        });
      }
      router.back();
    } catch (error) {
      console.error('Error saving export integration:', error);
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationSaveError());
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      color: palette.text,
      borderColor: palette.inputBorder,
      backgroundColor: palette.cardBackground,
    },
  ];

  const showOauth2Warning =
    authType === 'oauth2_cc' &&
    oauth2TokenUrl.trim().startsWith('http://') &&
    isSecureOrLocalUrl(oauth2TokenUrl.trim());
  const showWebhookTlsNote = deliveryType === 'webhook' && webhookUrl.trim().startsWith('https://');
  const showOauth2TlsNote =
    authType === 'oauth2_cc' && oauth2TokenUrl.trim().startsWith('https://');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isEdit
            ? LL.settings.exportIntegrationEditTitle()
            : LL.settings.exportIntegrationAddTitle(),
          headerRight: () => (
            <ThemedText
              style={[styles.saveButton, { color: saving ? palette.textMuted : palette.tint }]}
              onPress={() => void handleSave()}
            >
              {saving ? LL.common.loading() : LL.common.save()}
            </ThemedText>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <View style={styles.field}>
          <ThemedText style={styles.label}>{LL.settings.exportIntegrationNameLabel()} *</ThemedText>
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={setName}
            placeholder={LL.settings.exportIntegrationNameLabel()}
            placeholderTextColor={palette.placeholder}
            autoCapitalize="words"
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <ThemedText style={styles.label}>
            {LL.settings.exportIntegrationDescriptionLabel()}
          </ThemedText>
          <TextInput
            style={[inputStyle, styles.descriptionInput]}
            value={description}
            onChangeText={setDescription}
            placeholder={LL.settings.exportIntegrationDescriptionPlaceholder()}
            placeholderTextColor={palette.placeholder}
            multiline
          />
        </View>

        {/* Document type */}
        <View style={styles.field}>
          <ThemedText style={styles.label}>
            {LL.settings.exportIntegrationDocumentTypeLabel()} *
          </ThemedText>
          <View
            style={[
              styles.segmentedControl,
              { backgroundColor: palette.backgroundSubtle, borderColor: palette.border },
            ]}
          >
            {DOCUMENT_TYPES.map((type) => {
              const active = documentType === type;
              return (
                <Pressable
                  key={type}
                  style={[styles.segment, active && { backgroundColor: palette.cardBackground }]}
                  onPress={() => setDocumentType(type)}
                >
                  <ThemedText
                    style={[
                      styles.segmentText,
                      { color: active ? palette.tint : palette.textMuted },
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {getTypeLabel(type)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* XSLT */}
        <View style={styles.field}>
          <View style={styles.xsltLabelRow}>
            <ThemedText style={styles.label}>
              {LL.settings.exportIntegrationXsltLabel()} *
            </ThemedText>
            <Pressable
              style={({ pressed }) => [
                styles.loadFileButton,
                { borderColor: palette.tint, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => void handleLoadFromFile()}
            >
              <IconSymbol name="folder" size={13} color={palette.tint} />
              <ThemedText style={[styles.loadFileButtonText, { color: palette.tint }]}>
                {LL.settings.exportIntegrationLoadFromFile()}
              </ThemedText>
            </Pressable>
          </View>
          <TextInput
            style={[inputStyle, styles.xsltInput]}
            value={xslt}
            onChangeText={setXslt}
            placeholder={LL.settings.exportIntegrationXsltPlaceholder()}
            placeholderTextColor={palette.placeholder}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
          />
          <ThemedText style={[styles.helpText, { color: palette.textMuted }]}>
            {LL.settings.exportIntegrationXsltHelp()}
          </ThemedText>
        </View>

        {/* Delivery */}
        <View style={styles.field}>
          <ThemedText style={styles.label}>
            {LL.settings.exportIntegrationDeliveryLabel()}
          </ThemedText>
          <View
            style={[
              styles.segmentedControl,
              { backgroundColor: palette.backgroundSubtle, borderColor: palette.border },
            ]}
          >
            {(['share', 'clipboard', 'webhook'] as DeliveryType[]).map((type) => {
              const active = deliveryType === type;
              const label =
                type === 'share'
                  ? LL.settings.exportIntegrationDeliveryShare()
                  : type === 'clipboard'
                    ? LL.settings.exportIntegrationDeliveryClipboard()
                    : LL.settings.exportIntegrationDeliveryWebhook();
              return (
                <Pressable
                  key={type}
                  style={[styles.segment, active && { backgroundColor: palette.cardBackground }]}
                  onPress={() => setDeliveryType(type)}
                >
                  <ThemedText
                    style={[
                      styles.segmentText,
                      { color: active ? palette.tint : palette.textMuted },
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Webhook fields */}
          {deliveryType === 'webhook' && (
            <View style={styles.webhookSection}>
              {/* URL */}
              <View style={styles.webhookField}>
                <ThemedText style={styles.webhookLabel}>
                  {LL.settings.exportIntegrationWebhookUrlLabel()} *
                </ThemedText>
                <TextInput
                  style={inputStyle}
                  value={webhookUrl}
                  onChangeText={setWebhookUrl}
                  placeholder={LL.settings.exportIntegrationWebhookUrlPlaceholder()}
                  placeholderTextColor={palette.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {showWebhookTlsNote ? (
                  <ThemedText style={[styles.helpText, { color: palette.textMuted }]}>
                    {LL.settings.exportIntegrationWebhookTlsNote()}
                  </ThemedText>
                ) : null}
              </View>

              {/* Method */}
              <View style={styles.webhookField}>
                <ThemedText style={styles.webhookLabel}>
                  {LL.settings.exportIntegrationWebhookMethodLabel()}
                </ThemedText>
                <View
                  style={[
                    styles.segmentedControl,
                    { backgroundColor: palette.backgroundSubtle, borderColor: palette.border },
                  ]}
                >
                  {WEBHOOK_METHODS.map((method) => {
                    const active = webhookMethod === method;
                    return (
                      <Pressable
                        key={method}
                        style={[
                          styles.segment,
                          active && { backgroundColor: palette.cardBackground },
                        ]}
                        onPress={() => setWebhookMethod(method)}
                      >
                        <ThemedText
                          style={[
                            styles.segmentText,
                            { color: active ? palette.tint : palette.textMuted },
                            active && styles.segmentTextActive,
                          ]}
                        >
                          {method}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Content-Type */}
              <View style={styles.webhookField}>
                <ThemedText style={styles.webhookLabel}>
                  {LL.settings.exportIntegrationWebhookContentTypeLabel()}
                </ThemedText>
                <TextInput
                  style={inputStyle}
                  value={webhookContentType}
                  onChangeText={setWebhookContentType}
                  placeholder={LL.settings.exportIntegrationContentTypePlaceholder()}
                  placeholderTextColor={palette.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Auth type */}
              <View style={styles.webhookField}>
                <ThemedText style={styles.webhookLabel}>
                  {LL.settings.exportIntegrationWebhookAuthLabel()}
                </ThemedText>
                <View
                  style={[
                    styles.authTypeList,
                    { borderColor: palette.border, backgroundColor: palette.cardBackground },
                  ]}
                >
                  {AUTH_TYPES.map((type, idx) => {
                    const active = authType === type;
                    const isLast = idx === AUTH_TYPES.length - 1;
                    return (
                      <View key={type}>
                        <Pressable style={styles.authTypeRow} onPress={() => setAuthType(type)}>
                          <ThemedText
                            style={[
                              styles.authTypeLabel,
                              { color: active ? palette.tint : palette.text },
                              active && styles.authTypeLabelActive,
                            ]}
                          >
                            {getAuthTypeLabel(type)}
                          </ThemedText>
                          {active && <IconSymbol name="checkmark" size={15} color={palette.tint} />}
                        </Pressable>
                        {!isLast && (
                          <View
                            style={[styles.authTypeDivider, { backgroundColor: palette.border }]}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Bearer fields */}
                {authType === 'bearer' && (
                  <View style={styles.authFields}>
                    <TextInput
                      style={inputStyle}
                      value={bearerToken}
                      onChangeText={setBearerToken}
                      placeholder={LL.settings.exportIntegrationWebhookBearerTokenLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                  </View>
                )}

                {/* API Key fields */}
                {authType === 'api_key' && (
                  <View style={styles.authFields}>
                    <TextInput
                      style={inputStyle}
                      value={apiKeyHeader}
                      onChangeText={setApiKeyHeader}
                      placeholder={LL.settings.exportIntegrationWebhookApiKeyHeaderLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[inputStyle, { marginTop: 8 }]}
                      value={apiKeyValue}
                      onChangeText={setApiKeyValue}
                      placeholder={LL.settings.exportIntegrationWebhookApiKeyValueLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                  </View>
                )}

                {/* Basic fields */}
                {authType === 'basic' && (
                  <View style={styles.authFields}>
                    <TextInput
                      style={inputStyle}
                      value={basicUsername}
                      onChangeText={setBasicUsername}
                      placeholder={LL.settings.exportIntegrationWebhookBasicUsernameLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[inputStyle, { marginTop: 8 }]}
                      value={basicPassword}
                      onChangeText={setBasicPassword}
                      placeholder={LL.settings.exportIntegrationWebhookBasicPasswordLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                  </View>
                )}

                {/* OAuth2 CC fields */}
                {authType === 'oauth2_cc' && (
                  <View style={styles.authFields}>
                    <TextInput
                      style={inputStyle}
                      value={oauth2TokenUrl}
                      onChangeText={setOauth2TokenUrl}
                      placeholder={LL.settings.exportIntegrationWebhookOauth2TokenUrlLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    {showOauth2TlsNote ? (
                      <ThemedText style={[styles.helpText, { color: palette.textMuted }]}>
                        {LL.settings.exportIntegrationWebhookTlsNote()}
                      </ThemedText>
                    ) : null}
                    {showOauth2Warning && (
                      <View
                        style={[
                          styles.warningBox,
                          { backgroundColor: '#fff3cd', borderColor: '#ffc107' },
                        ]}
                      >
                        <IconSymbol name="exclamationmark.triangle" size={14} color="#b45309" />
                        <ThemedText style={[styles.warningText, { color: '#b45309' }]}>
                          {LL.settings.exportIntegrationWebhookOauth2InsecureWarning()}
                        </ThemedText>
                      </View>
                    )}
                    <TextInput
                      style={[inputStyle, { marginTop: 8 }]}
                      value={oauth2ClientId}
                      onChangeText={setOauth2ClientId}
                      placeholder={LL.settings.exportIntegrationWebhookOauth2ClientIdLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[inputStyle, { marginTop: 8 }]}
                      value={oauth2ClientSecret}
                      onChangeText={setOauth2ClientSecret}
                      placeholder={LL.settings.exportIntegrationWebhookOauth2ClientSecretLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                    <TextInput
                      style={[inputStyle, { marginTop: 8 }]}
                      value={oauth2Scope}
                      onChangeText={setOauth2Scope}
                      placeholder={LL.settings.exportIntegrationWebhookOauth2ScopeLabel()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <ThemedText style={[styles.helpText, { color: palette.textMuted }]}>
                      {LL.settings.exportIntegrationWebhookOauth2ScopeHelp()}
                    </ThemedText>
                  </View>
                )}
              </View>

              {/* Extra headers */}
              <View style={styles.webhookField}>
                <ThemedText style={styles.webhookLabel}>
                  {LL.settings.exportIntegrationWebhookHeadersLabel()}
                </ThemedText>
                {extraHeaders.map((header, idx) => (
                  <View key={idx} style={styles.headerRow}>
                    <TextInput
                      style={[inputStyle, styles.headerKeyInput]}
                      value={header.key}
                      onChangeText={(text) => updateHeader(idx, 'key', text)}
                      placeholder={LL.settings.exportIntegrationWebhookHeaderKeyPlaceholder()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[inputStyle, styles.headerValueInput]}
                      value={header.value}
                      onChangeText={(text) => updateHeader(idx, 'value', text)}
                      placeholder={LL.settings.exportIntegrationWebhookHeaderValuePlaceholder()}
                      placeholderTextColor={palette.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.headerRemoveButton,
                        { opacity: pressed ? 0.6 : 1 },
                      ]}
                      onPress={() => removeHeader(idx)}
                    >
                      <IconSymbol name="minus.circle" size={20} color={palette.destructive} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  style={({ pressed }) => [
                    styles.addHeaderButton,
                    { borderColor: palette.tint, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={addHeader}
                >
                  <IconSymbol name="plus" size={13} color={palette.tint} />
                  <ThemedText style={[styles.addHeaderText, { color: palette.tint }]}>
                    {LL.settings.exportIntegrationWebhookAddHeader()}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={styles.testActionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.testActionButton,
              {
                backgroundColor: palette.cardBackground,
                borderColor: palette.border,
                opacity: pressed || testingAction === 'transform' ? 0.72 : 1,
              },
            ]}
            onPress={() => void handleTestTransform()}
            disabled={testingAction !== null}
          >
            <ThemedText style={[styles.testActionButtonText, { color: palette.text }]}>
              {testingAction === 'transform'
                ? LL.common.loading()
                : LL.settings.exportIntegrationTestTransform()}
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.testActionButton,
              {
                backgroundColor: palette.tint,
                borderColor: palette.tint,
                opacity: pressed || testingAction === 'delivery' ? 0.72 : 1,
              },
            ]}
            onPress={() => void handleTestDelivery()}
            disabled={testingAction !== null}
          >
            <ThemedText style={[styles.testActionButtonText, { color: palette.onTint }]}>
              {testingAction === 'delivery'
                ? LL.common.loading()
                : LL.settings.exportIntegrationTestDelivery()}
            </ThemedText>
          </Pressable>
        </View>
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
    gap: Spacing.lg,
    paddingBottom: 32,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: FontSizes.base,
  },
  descriptionInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentText: {
    fontSize: FontSizes.sm,
  },
  segmentTextActive: {
    fontWeight: '600',
  },
  xsltLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadFileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  loadFileButtonText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  xsltInput: {
    minHeight: 280,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
  },
  helpText: {
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  saveButton: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  testActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  testActionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testActionButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  webhookSection: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  webhookField: {
    gap: Spacing.xs,
  },
  webhookLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    opacity: 0.75,
  },
  authTypeList: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  authTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  authTypeLabel: {
    fontSize: FontSizes.sm,
  },
  authTypeLabelActive: {
    fontWeight: '600',
  },
  authTypeDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 12,
  },
  authFields: {
    marginTop: Spacing.xs,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
  },
  warningText: {
    fontSize: FontSizes.xs,
    lineHeight: 18,
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  headerKeyInput: {
    flex: 1,
  },
  headerValueInput: {
    flex: 1,
  },
  headerRemoveButton: {
    padding: 4,
  },
  addHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  addHeaderText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
});
