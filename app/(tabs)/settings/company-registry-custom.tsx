import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardAwareScroll } from '@/components/ui/keyboard-aware-scroll';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { usePalette } from '@/hooks/use-palette';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  loadCustomConnectorSettings,
  saveCustomConnectorSettings,
} from '@/repositories/company-registry/custom-connector-settings';
import {
  HTTP_AUTH_TYPES,
  type HttpAuth,
  type HttpAuthType,
  isSecureOrLocalHttpUrl,
} from '@/utils/http-auth';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

export default function CompanyRegistryCustomSettingsScreen() {
  const palette = usePalette();
  const { LL } = useI18nContext();
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<HttpAuthType>('none');
  const [bearerToken, setBearerToken] = useState('');
  const [apiKeyHeader, setApiKeyHeader] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');
  const [oauth2TokenUrl, setOauth2TokenUrl] = useState('');
  const [oauth2ClientId, setOauth2ClientId] = useState('');
  const [oauth2ClientSecret, setOauth2ClientSecret] = useState('');
  const [oauth2Scope, setOauth2Scope] = useState('');
  const [saving, setSaving] = useState(false);

  const responseExample = `{
  "companyId": "00006947",
  "legalName": "Example Company s.r.o.",
  "vatNumber": "CZ00006947",
  "importAddresses": [
    {
      "type": "billing",
      "street": "Letenska 525/15",
      "city": "Praha 1",
      "postalCode": "11800",
      "country": "CZ"
    }
  ]
}`;

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await loadCustomConnectorSettings();
        setUrl(settings.url);
        applyAuth(settings.auth);
      } catch (error) {
        console.error('Error loading custom company registry settings:', error);
        Alert.alert(LL.common.error(), LL.settings.saveError());
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyAuth = (auth: HttpAuth) => {
    setAuthType(auth.type);
    setBearerToken(auth.type === 'bearer' ? auth.token : '');
    setApiKeyHeader(auth.type === 'api_key' ? auth.headerName : '');
    setApiKeyValue(auth.type === 'api_key' ? auth.value : '');
    setBasicUsername(auth.type === 'basic' ? auth.username : '');
    setBasicPassword(auth.type === 'basic' ? auth.password : '');
    setOauth2TokenUrl(auth.type === 'oauth2_cc' ? auth.tokenUrl : '');
    setOauth2ClientId(auth.type === 'oauth2_cc' ? auth.clientId : '');
    setOauth2ClientSecret(auth.type === 'oauth2_cc' ? auth.clientSecret : '');
    setOauth2Scope(auth.type === 'oauth2_cc' ? auth.scope : '');
  };

  const getAuthTypeLabel = (type: HttpAuthType): string => {
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

  const buildAuth = (): HttpAuth | null => {
    if (authType === 'bearer') {
      if (!bearerToken.trim()) {
        Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookBearerRequired());
        return null;
      }
      return { type: 'bearer', token: bearerToken.trim() };
    }
    if (authType === 'api_key') {
      if (!apiKeyHeader.trim() || !apiKeyValue.trim()) {
        Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookApiKeyRequired());
        return null;
      }
      return { type: 'api_key', headerName: apiKeyHeader.trim(), value: apiKeyValue.trim() };
    }
    if (authType === 'basic') {
      if (!basicUsername.trim() || !basicPassword.trim()) {
        Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookBasicRequired());
        return null;
      }
      return {
        type: 'basic',
        username: basicUsername.trim(),
        password: basicPassword.trim(),
      };
    }
    if (authType === 'oauth2_cc') {
      if (!oauth2TokenUrl.trim() || !oauth2ClientId.trim() || !oauth2ClientSecret.trim()) {
        Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookOauth2Required());
        return null;
      }
      if (!isSecureOrLocalHttpUrl(oauth2TokenUrl.trim())) {
        Alert.alert(LL.common.error(), LL.settings.exportIntegrationWebhookOauth2HttpsRequired());
        return null;
      }
      return {
        type: 'oauth2_cc',
        tokenUrl: oauth2TokenUrl.trim(),
        clientId: oauth2ClientId.trim(),
        clientSecret: oauth2ClientSecret.trim(),
        scope: oauth2Scope.trim(),
      };
    }
    return { type: 'none' };
  };

  const handleSave = async () => {
    if (saving) return;
    if (!url.trim()) {
      Alert.alert(
        LL.common.error(),
        LL.settings.companyRegistryRequiredField({
          field: LL.settings.companyRegistryConnectorUrlLabel(),
        }),
      );
      return;
    }
    if (!isSecureOrLocalHttpUrl(url.trim())) {
      Alert.alert(LL.common.error(), LL.settings.exportIntegrationHttpsRequired());
      return;
    }

    const auth = buildAuth();
    if (!auth) return;

    try {
      setSaving(true);
      await saveCustomConnectorSettings({ url: url.trim(), auth });
      Alert.alert(LL.common.success(), LL.settings.saveSuccess());
    } catch (error) {
      console.error('Error saving custom company registry settings:', error);
      Alert.alert(LL.common.error(), LL.settings.saveError());
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      color: palette.text,
      borderColor: palette.inputBorder,
      backgroundColor: palette.inputBackground,
    },
  ];

  const showOauth2Warning =
    authType === 'oauth2_cc' &&
    oauth2TokenUrl.trim().startsWith('http://') &&
    isSecureOrLocalHttpUrl(oauth2TokenUrl.trim());
  const showOauth2TlsNote =
    authType === 'oauth2_cc' && oauth2TokenUrl.trim().startsWith('https://');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: LL.settings.companyRegistryOptionCustomConnector() }} />
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {LL.settings.companyRegistryConnectorUrlLabel()}
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            {LL.settings.companyRegistryConnectorUrlHelp()}
          </ThemedText>
          <TextInput
            style={inputStyle}
            placeholder="https://example.com/company/{companyId}"
            placeholderTextColor={palette.placeholder}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </ThemedView>

        <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {LL.settings.exportIntegrationWebhookAuthLabel()}
          </ThemedText>
          <View style={[styles.authTypeList, { borderColor: palette.border }]}>
            {HTTP_AUTH_TYPES.map((type, index) => {
              const active = authType === type;
              const isLast = index === HTTP_AUTH_TYPES.length - 1;
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
                    <View style={[styles.authTypeDivider, { backgroundColor: palette.border }]} />
                  )}
                </View>
              );
            })}
          </View>

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
                style={[inputStyle, styles.stackedInput]}
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
                style={[inputStyle, styles.stackedInput]}
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
                <View style={[styles.warningBox, { backgroundColor: '#fff3cd' }]}>
                  <IconSymbol name="exclamationmark.triangle" size={14} color="#b45309" />
                  <ThemedText style={[styles.warningText, { color: '#b45309' }]}>
                    {LL.settings.exportIntegrationWebhookOauth2InsecureWarning()}
                  </ThemedText>
                </View>
              )}
              <TextInput
                style={[inputStyle, styles.stackedInput]}
                value={oauth2ClientId}
                onChangeText={setOauth2ClientId}
                placeholder={LL.settings.exportIntegrationWebhookOauth2ClientIdLabel()}
                placeholderTextColor={palette.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={[inputStyle, styles.stackedInput]}
                value={oauth2ClientSecret}
                onChangeText={setOauth2ClientSecret}
                placeholder={LL.settings.exportIntegrationWebhookOauth2ClientSecretLabel()}
                placeholderTextColor={palette.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TextInput
                style={[inputStyle, styles.stackedInput]}
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
        </ThemedView>

        <ThemedView style={[styles.section, { backgroundColor: palette.cardBackground }]}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            {LL.settings.companyRegistryCustomResponseTitle()}
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            {LL.settings.companyRegistryCustomResponseDescription()}
          </ThemedText>
          <ThemedText style={styles.codeBlock}>{responseExample}</ThemedText>
          <ThemedText style={styles.sectionHint}>
            {LL.settings.companyRegistryCustomResponseDocHint()}
          </ThemedText>
        </ThemedView>

        <Pressable
          style={[styles.saveButton, { backgroundColor: palette.tint }]}
          onPress={() => void handleSave()}
          accessibilityRole="button"
          accessibilityLabel={LL.common.save()}
        >
          <ThemedText style={[styles.saveButtonText, { color: palette.onTint }]}>
            {saving ? LL.common.loading() : LL.common.save()}
          </ThemedText>
        </Pressable>
      </KeyboardAwareScroll>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: 40 },
  section: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: { marginBottom: 12 },
  sectionDescription: { fontSize: 14, opacity: 0.7, marginBottom: 12 },
  sectionHint: { fontSize: 12, opacity: 0.7, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  authTypeList: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  authTypeRow: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  authTypeLabel: {
    fontSize: 15,
  },
  authTypeLabelActive: {
    fontWeight: '600',
  },
  authTypeDivider: {
    height: StyleSheet.hairlineWidth,
  },
  authFields: {
    marginTop: 12,
  },
  stackedInput: {
    marginTop: 8,
  },
  helpText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.9,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 16, fontWeight: '600' },
});
