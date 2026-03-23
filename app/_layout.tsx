import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { usePathname, useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBrand } from '@/components/ui/app-brand';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Fonts, Shadows, withOpacity } from '@/constants/theme';
import database from '@/db';
import { useAutoSync } from '@/hooks/use-auto-sync';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePendingSyncConflictCount } from '@/hooks/use-pending-sync-conflict-count';
import { useTimerLimitGuard } from '@/hooks/use-timer-limit-guard';
import { TypesafeI18n, useI18nContext } from '@/i18n/i18n-react';
import type { Locales } from '@/i18n/i18n-types';
import { baseLocale } from '@/i18n/i18n-util';
import { getMoreSectionTitle, resolveAppLanguageSetting } from '@/i18n/locale-options';
import AppSettingsModel from '@/model/AppSettingsModel';
import { hasPinHash, verifyPin } from '@/repositories/app-lock-repository';
import { setupCurrencyFormatCacheSync } from '@/repositories/currency-settings-repository';
import { getErrorMessage } from '@/utils/error-utils';
import { getSettings } from '@/repositories/settings-repository';
import { handleTimerActionUrl } from '@/repositories/timer-deeplink-repository';
import { isAndroid, isIos } from '@/utils/platform';
import {
  setTimerWidgetsEnabled,
  setupWidgetInteractionListener,
} from '@/widgets/timer-widget-sync';
import { observeDeviceSyncSettings } from '@/repositories/device-sync-settings-repository';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [locale, setLocale] = useState<Locales>(baseLocale);
  useAutoSync();

  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | undefined;
    const settingsCollection = database.get<AppSettingsModel>(AppSettingsModel.table);

    const syncLocaleFromSettings = async () => {
      try {
        const settings = await getSettings();
        if (!isMounted) return;
        const nextLocale = resolveAppLanguageSetting(settings.language, baseLocale);
        setLocale((currentLocale) => (currentLocale === nextLocale ? currentLocale : nextLocale));
      } catch (error) {
        console.error('Error loading locale settings:', error);
      }

      if (!isMounted) return;

      subscription = settingsCollection
        .query()
        .observe()
        .subscribe((settingsRows) => {
          const nextLocale = resolveAppLanguageSetting(settingsRows[0]?.language, baseLocale);
          setLocale((currentLocale) => (currentLocale === nextLocale ? currentLocale : nextLocale));
        });
    };

    void syncLocaleFromSettings();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let listenerSub: { remove: () => void } | null = null;
    const unsubscribe = observeDeviceSyncSettings((deviceSettings) => {
      setTimerWidgetsEnabled(deviceSettings.timerWidgetsEnabled !== false);

      if (deviceSettings.timerWidgetsEnabled === false) {
        listenerSub?.remove();
        listenerSub = null;
        return;
      }

      if (!listenerSub) {
        listenerSub = setupWidgetInteractionListener();
      }
    });

    return () => {
      listenerSub?.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cleanup: { remove: () => void } | undefined;
    void setupCurrencyFormatCacheSync().then((subscription) => {
      cleanup = subscription;
    });
    return () => cleanup?.remove();
  }, []);

  return (
    <TypesafeI18n locale={locale}>
      <RootLayoutNav colorScheme={colorScheme} />
    </TypesafeI18n>
  );
}

function RootLayoutNav({ colorScheme }: { colorScheme: ReturnType<typeof useColorScheme> }) {
  const palette = Colors[colorScheme ?? 'light'];
  const { LL, locale } = useI18nContext();
  const insets = useSafeAreaInsets();
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [isSessionUnlocked, setIsSessionUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const pendingTimerActionUrl = useRef<string | null>(null);
  useTimerLimitGuard();

  const processTimerDeepLink = useCallback(async (url: string | null | undefined) => {
    const normalized = url?.trim();
    if (!normalized || !normalized.toLowerCase().startsWith('faktoro://')) return;

    try {
      const handled = await handleTimerActionUrl(normalized);
      if (handled) {
        pendingTimerActionUrl.current = null;
      }
    } catch (error) {
      console.error('[TimerQuickAction] Failed to process URL:', normalized, error);
    }
  }, []);

  const tryBiometricUnlock = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const localAuth = require('expo-local-authentication');
      if (!localAuth) return false;

      const hasHardware = await localAuth.hasHardwareAsync();
      const isEnrolled = await localAuth.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return false;

      const result = await localAuth.authenticateAsync({
        promptMessage: LL.settings.unlockBiometricPrompt(),
        fallbackLabel: LL.settings.unlockUsePin(),
      });

      if (result.success) {
        setNeedsUnlock(false);
        setIsSessionUnlocked(true);
        setUnlockError('');
      }
      return result.success;
    } catch {
      return false;
    }
  }, [LL.settings]);

  useEffect(() => {
    const checkLock = async () => {
      try {
        const settings = await getSettings();
        const pinExists = await hasPinHash();
        const shouldLock = !!settings.appLockEnabled && pinExists;

        if (!shouldLock || isSessionUnlocked) {
          setNeedsUnlock(false);
          setIsSessionUnlocked(true);
          setIsCheckingLock(false);
          return;
        }

        setNeedsUnlock(true);
        setBiometricEnabled(!!settings.appLockBiometricEnabled);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const localAuth = require('expo-local-authentication');
        if (localAuth) {
          const hasHardware = await localAuth.hasHardwareAsync();
          const isEnrolled = await localAuth.isEnrolledAsync();
          const available = hasHardware && isEnrolled;
          setBiometricAvailable(available);

          if (available && settings.appLockBiometricEnabled) {
            await tryBiometricUnlock();
          }
        }
      } catch (error) {
        console.error('Error checking app lock state:', error);
      } finally {
        setIsCheckingLock(false);
      }
    };

    void checkLock();
  }, [isSessionUnlocked, tryBiometricUnlock]);

  useEffect(() => {
    const handleIncomingUrl = (url: string | null | undefined) => {
      if (!url) return;
      if (!isSessionUnlocked) {
        pendingTimerActionUrl.current = url;
        return;
      }
      void processTimerDeepLink(url);
    };

    void Linking.getInitialURL().then((initialUrl) => {
      handleIncomingUrl(initialUrl);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [isSessionUnlocked, processTimerDeepLink]);

  useEffect(() => {
    if (!isSessionUnlocked || !pendingTimerActionUrl.current) return;
    const queuedUrl = pendingTimerActionUrl.current;
    void processTimerDeepLink(queuedUrl);
  }, [isSessionUnlocked, processTimerDeepLink]);

  const handleUnlockWithPin = useCallback(async () => {
    setUnlockError('');
    if (!pin) {
      setUnlockError(LL.settings.unlockPinRequired());
      return;
    }

    try {
      const valid = await verifyPin(pin);
      if (valid) {
        setNeedsUnlock(false);
        setIsSessionUnlocked(true);
        setPin('');
        return;
      }
      setUnlockError(LL.settings.unlockIncorrectPin());
    } catch (error) {
      console.error('Error verifying PIN:', error);
      const message = getErrorMessage(error, LL.settings.unlockGenericError());
      setUnlockError(message);
    }
  }, [LL.settings, pin]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Drawer
          drawerContent={(props) => <AppDrawerContent {...props} />}
          screenOptions={{
            drawerPosition: 'left',
            drawerType: 'front',
            drawerStyle: [
              styles.drawer,
              { backgroundColor: palette.backgroundSubtle, borderRightColor: palette.border },
            ],
            headerShown: false,
            overlayColor: 'rgba(0, 0, 0, 0.28)',
            swipeEnabled: !isIos,
          }}
        >
          <Drawer.Screen
            name="(tabs)"
            options={{
              title: getMoreSectionTitle(locale),
            }}
          />
        </Drawer>

        {!isSessionUnlocked && (isCheckingLock || needsUnlock) && (
          <View
            style={[
              styles.lockOverlay,
              {
                backgroundColor: palette.backgroundSubtle,
                paddingTop: Math.max(32, insets.top + 16),
                paddingBottom: Math.max(24, insets.bottom + 16),
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.lockGlowPrimary,
                { backgroundColor: withOpacity(palette.timeHighlight, isIos ? 0.22 : 0.18) },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.lockGlowSecondary,
                { backgroundColor: withOpacity(palette.success, isIos ? 0.16 : 0.12) },
              ]}
            />
            <KeyboardAvoidingView
              style={styles.lockKeyboardAvoid}
              behavior={isIos ? 'padding' : undefined}
            >
              {isCheckingLock ? (
                <View
                  style={[
                    styles.lockLoadingCard,
                    {
                      backgroundColor: withOpacity(palette.cardBackgroundElevated, 0.96),
                      borderColor: withOpacity(palette.borderStrong, 0.72),
                    },
                  ]}
                >
                  <Image
                    source={require('../assets/images/icon.png')}
                    style={styles.lockLoadingIcon}
                    resizeMode="contain"
                  />
                  <Text style={[styles.lockLoadingTitle, { color: palette.text }]}>Faktoro</Text>
                  <ActivityIndicator size="large" color={palette.timeHighlight} />
                </View>
              ) : (
                <View
                  style={[
                    styles.lockCard,
                    {
                      backgroundColor: withOpacity(palette.cardBackgroundElevated, 0.97),
                      borderColor: withOpacity(palette.borderStrong, 0.72),
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.lockBrandShell,
                      { backgroundColor: withOpacity(palette.timeHighlight, 0.12) },
                    ]}
                  >
                    <Image
                      source={require('../assets/images/icon.png')}
                      style={styles.lockBrandIcon}
                      resizeMode="contain"
                    />
                    <View
                      style={[
                        styles.lockBadge,
                        {
                          backgroundColor: palette.cardBackgroundElevated,
                          borderColor: withOpacity(palette.borderStrong, 0.9),
                        },
                      ]}
                    >
                      <IconSymbol name="lock.fill" size={18} color={palette.timeHighlight} />
                    </View>
                  </View>
                  <Text style={[styles.unlockEyebrowText, { color: palette.timeHighlight }]}>
                    Faktoro
                  </Text>
                  <Text style={[styles.unlockTitleText, { color: palette.text }]}>
                    {LL.settings.unlockTitle()}
                  </Text>
                  <Text style={[styles.unlockSubtitleText, { color: palette.textSecondary }]}>
                    {LL.settings.unlockDescription()}
                  </Text>

                  <TextInput
                    style={[
                      styles.unlockInput,
                      {
                        color: palette.text,
                        borderColor: palette.inputBorder,
                        backgroundColor: palette.inputBackground,
                      },
                    ]}
                    placeholder={LL.settings.unlockPinPlaceholder()}
                    placeholderTextColor={palette.placeholder}
                    value={pin}
                    onChangeText={setPin}
                    secureTextEntry
                    keyboardType="number-pad"
                    maxLength={10}
                    textAlign="center"
                  />

                  {!!unlockError && (
                    <Text style={[styles.unlockErrorText, { color: palette.destructive }]}>
                      {unlockError}
                    </Text>
                  )}

                  <View style={styles.unlockButtons}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.unlockButton,
                        { backgroundColor: palette.timeHighlight },
                        pressed && styles.unlockButtonPressed,
                      ]}
                      onPress={handleUnlockWithPin}
                      android_ripple={{ color: palette.border }}
                      accessibilityRole="button"
                      accessibilityLabel={LL.settings.unlockButton()}
                    >
                      <Text style={[styles.unlockButtonText, { color: palette.onHighlight }]}>
                        {LL.settings.unlockButton()}
                      </Text>
                    </Pressable>

                    {biometricEnabled && biometricAvailable && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.unlockButton,
                          { backgroundColor: palette.buttonNeutralBackground },
                          pressed && styles.unlockButtonPressed,
                        ]}
                        onPress={() => void tryBiometricUnlock()}
                        android_ripple={{ color: palette.border }}
                        accessibilityRole="button"
                        accessibilityLabel={LL.settings.unlockTryBiometric()}
                      >
                        <Text style={[styles.unlockButtonAltText, { color: palette.text }]}>
                          {LL.settings.unlockTryBiometric()}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          </View>
        )}

        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function AppDrawerContent({ navigation }: DrawerContentComponentProps) {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const pathname = usePathname();
  const router = useRouter();
  const { LL } = useI18nContext();
  const { top, bottom } = useSafeAreaInsets();
  const pendingConflictCount = usePendingSyncConflictCount();
  const drawerBrand = (
    <View style={styles.drawerHeader}>
      <AppBrand palette={palette} size={52} />
    </View>
  );

  type DrawerDestination = {
    href:
      | '/time-tracking'
      | '/timesheets'
      | '/invoices'
      | '/clients'
      | '/reports'
      | '/price-list'
      | '/settings';
    iconName:
      | 'clock.fill'
      | 'doc.text.fill'
      | 'doc.richtext.fill'
      | 'person.3.fill'
      | 'chart.bar.fill'
      | 'tag.fill'
      | 'gearshape.fill';
    label: string;
  };

  const destinations: DrawerDestination[] = [
    {
      href: '/time-tracking',
      iconName: 'clock.fill',
      label: LL.timeTracking.title(),
    },
    {
      href: '/timesheets',
      iconName: 'doc.text.fill',
      label: LL.timesheets.title(),
    },
    {
      href: '/invoices',
      iconName: 'doc.richtext.fill',
      label: LL.invoices.title(),
    },
    {
      href: '/clients',
      iconName: 'person.3.fill',
      label: LL.tabs.clients(),
    },
    {
      href: '/reports',
      iconName: 'chart.bar.fill',
      label: LL.reports.title(),
    },
    {
      href: '/price-list',
      iconName: 'tag.fill',
      label: LL.tabs.priceList(),
    },
    {
      href: '/settings',
      iconName: 'gearshape.fill',
      label: LL.tabs.settings(),
    },
  ];
  const dividerIndex = 4;

  const navigateTo = (href: DrawerDestination['href']) => {
    navigation.closeDrawer();
    router.navigate(href);
  };

  const renderDrawerItem = (destination: DrawerDestination) => {
    const focused = pathname === destination.href || pathname.startsWith(`${destination.href}/`);
    const badgeLabel =
      destination.href === '/settings' && pendingConflictCount > 0
        ? pendingConflictCount > 9
          ? '9+'
          : String(pendingConflictCount)
        : null;

    return (
      <Pressable
        key={destination.href}
        style={({ pressed }) => [
          styles.drawerItem,
          {
            backgroundColor: focused
              ? withOpacity(palette.timeHighlight, colorScheme === 'dark' ? 0.22 : 0.12)
              : 'transparent',
            borderColor: focused
              ? withOpacity(palette.timeHighlight, colorScheme === 'dark' ? 0.36 : 0.2)
              : 'transparent',
          },
          pressed && styles.drawerItemPressed,
        ]}
        onPress={() => navigateTo(destination.href)}
        accessibilityRole="button"
        accessibilityLabel={destination.label}
      >
        <View
          style={[
            styles.drawerIconBadge,
            {
              backgroundColor: focused ? palette.timeHighlight : palette.cardBackgroundElevated,
              borderColor: focused
                ? withOpacity(palette.timeHighlight, 0.42)
                : withOpacity(palette.borderStrong, 0.78),
            },
          ]}
        >
          <IconSymbol
            color={focused ? palette.onHighlight : palette.icon}
            name={destination.iconName}
            size={20}
          />
        </View>
        <Text
          style={[
            styles.drawerItemLabel,
            { color: focused ? palette.text : palette.textSecondary },
          ]}
        >
          {destination.label}
        </Text>
        {badgeLabel ? (
          <View style={[styles.drawerItemCountBadge, { backgroundColor: palette.destructive }]}>
            <Text style={[styles.drawerItemCountBadgeText, { color: palette.onDestructive }]}>
              {badgeLabel}
            </Text>
          </View>
        ) : null}
        {focused && (
          <View style={[styles.drawerItemActiveDot, { backgroundColor: palette.timeHighlight }]} />
        )}
      </Pressable>
    );
  };

  return (
    <DrawerContentScrollView
      contentContainerStyle={[
        styles.drawerContent,
        { paddingTop: Math.max(top, 10), paddingBottom: Math.max(bottom, 18) },
      ]}
      style={{ backgroundColor: palette.backgroundSubtle }}
    >
      <View
        pointerEvents="none"
        style={[
          styles.drawerGlowPrimary,
          {
            backgroundColor: withOpacity(
              palette.timeHighlight,
              colorScheme === 'dark' ? 0.18 : 0.14,
            ),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.drawerGlowSecondary,
          { backgroundColor: withOpacity(palette.success, colorScheme === 'dark' ? 0.12 : 0.1) },
        ]}
      />

      {isAndroid ? (
        <View style={styles.drawerHeaderPlain}>{drawerBrand}</View>
      ) : (
        <LinearGradient
          colors={[
            withOpacity(palette.timeHighlight, colorScheme === 'dark' ? 0.26 : 0.22),
            withOpacity(palette.cardBackgroundElevated, 0.96),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.drawerHeaderCard,
            {
              borderColor: withOpacity(palette.borderStrong, 0.68),
            },
          ]}
        >
          {drawerBrand}
        </LinearGradient>
      )}

      <View
        style={[
          styles.drawerSectionCard,
          {
            backgroundColor: withOpacity(palette.cardBackgroundElevated, 0.94),
            borderColor: withOpacity(palette.borderStrong, 0.72),
          },
        ]}
      >
        {destinations.map((destination, index) => (
          <View key={destination.href}>
            {index === dividerIndex ? (
              <View
                style={[
                  styles.drawerDivider,
                  styles.drawerSectionDivider,
                  { backgroundColor: withOpacity(palette.borderStrong, 0.82) },
                ]}
              />
            ) : null}
            {renderDrawerItem(destination)}
          </View>
        ))}
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  drawer: {
    borderRightWidth: StyleSheet.hairlineWidth,
    width: 304,
  },
  drawerContent: {
    paddingTop: 10,
    paddingHorizontal: 10,
    gap: 12,
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  drawerHeaderCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    marginBottom: 2,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  drawerHeaderPlain: {
    marginBottom: 4,
  },
  drawerGlowPrimary: {
    position: 'absolute',
    top: -72,
    right: -42,
    width: 180,
    height: 180,
    borderRadius: 999,
  },
  drawerGlowSecondary: {
    position: 'absolute',
    left: -60,
    top: 170,
    width: 150,
    height: 150,
    borderRadius: 999,
  },
  drawerChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
  },
  drawerChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  drawerChipText: {
    fontFamily: Fonts.rounded,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  drawerSectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
    ...Shadows.md,
  },
  drawerItem: {
    minHeight: 58,
    borderRadius: 18,
    marginVertical: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  drawerItemPressed: {
    opacity: 0.84,
  },
  drawerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: 12,
  },
  drawerItemCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginRight: 8,
  },
  drawerItemCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  drawerItemActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  drawerDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 2,
    opacity: 0.75,
  },
  drawerSectionDivider: {
    marginTop: 8,
    marginBottom: 8,
    marginHorizontal: 10,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  lockGlowPrimary: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 999,
  },
  lockGlowSecondary: {
    position: 'absolute',
    bottom: -140,
    left: -96,
    width: 240,
    height: 240,
    borderRadius: 999,
  },
  lockCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    borderWidth: 1,
    alignItems: 'center',
    ...Shadows.xl,
  },
  lockLoadingCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 14,
    ...Shadows.xl,
  },
  lockKeyboardAvoid: {
    width: '100%',
    alignItems: 'center',
  },
  lockLoadingIcon: {
    width: 76,
    height: 76,
  },
  lockLoadingTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  lockBrandShell: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockBrandIcon: {
    width: 68,
    height: 68,
  },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  unlockEyebrowText: {
    fontFamily: Fonts.rounded,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  unlockTitleText: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  unlockSubtitleText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
    textAlign: 'center',
    maxWidth: 300,
  },
  unlockInput: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    minHeight: 58,
    width: '100%',
    letterSpacing: 6,
  },
  unlockErrorText: {
    fontSize: 13,
    marginTop: 8,
    width: '100%',
    textAlign: 'center',
  },
  unlockButtons: {
    width: '100%',
    gap: 12,
    marginTop: 16,
  },
  unlockButton: {
    width: '100%',
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 54,
    justifyContent: 'center',
  },
  unlockButtonPressed: {
    opacity: 0.82,
  },
  unlockButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  unlockButtonAltText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
