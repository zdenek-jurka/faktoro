import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18nContext } from '@/i18n/i18n-react';
import type { Locales } from '@/i18n/i18n-types';
import { isAndroid, isPad } from '@/utils/platform';
import React, { ReactNode, createContext, useContext, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';

type SelectOption = {
  value: string;
  label: string;
};

type SelectContextType = {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerLayout: SelectTriggerLayout | null;
  setTriggerLayout: (layout: SelectTriggerLayout | null) => void;
  options: SelectOption[];
  labels: Record<string, string>;
  registerItem: (option: SelectOption) => void;
  unregisterItem: (value: string) => void;
};

type SelectTriggerLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SelectContext = createContext<SelectContextType | undefined>(undefined);

const SELECT_LABELS: Record<Locales, { open: string; close: string; placeholder: string }> = {
  cs: {
    open: 'Otevřít seznam výběru',
    close: 'Zavřít seznam výběru',
    placeholder: 'Vyberte...',
  },
  de: {
    open: 'Auswahlliste öffnen',
    close: 'Auswahlliste schließen',
    placeholder: 'Bitte wählen...',
  },
  en: {
    open: 'Open selection list',
    close: 'Close selection list',
    placeholder: 'Select...',
  },
  es: {
    open: 'Abrir lista de selección',
    close: 'Cerrar lista de selección',
    placeholder: 'Seleccionar...',
  },
  fr: {
    open: 'Ouvrir la liste de sélection',
    close: 'Fermer la liste de sélection',
    placeholder: 'Sélectionner...',
  },
  pl: {
    open: 'Otwórz listę wyboru',
    close: 'Zamknij listę wyboru',
    placeholder: 'Wybierz...',
  },
  pt: {
    open: 'Abrir lista de seleção',
    close: 'Fechar lista de seleção',
    placeholder: 'Selecionar...',
  },
};

const useSelectContext = () => {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error('Select components must be used within Select');
  }
  return context;
};

type SelectProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
};

function matchesComponentName(type: unknown, componentName: string): boolean {
  if (!type || typeof type !== 'function') {
    return false;
  }

  const namedType = type as { displayName?: string; name?: string };
  return namedType.displayName === componentName || namedType.name === componentName;
}

function findSelectValuePlaceholder(children: ReactNode): string | undefined {
  let resolvedPlaceholder: string | undefined;

  const walk = (node: ReactNode) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child) || resolvedPlaceholder) return;
      const props = child.props as {
        children?: ReactNode;
        placeholder?: unknown;
      };

      if (
        (child.type === SelectValue || matchesComponentName(child.type, 'SelectValue')) &&
        typeof props.placeholder === 'string'
      ) {
        resolvedPlaceholder = props.placeholder;
        return;
      }

      if (props.children) {
        walk(props.children);
      }
    });
  };

  walk(children);
  return resolvedPlaceholder;
}

function collectSelectOptions(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];

  const walk = (node: ReactNode) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      const props = child.props as {
        children?: ReactNode;
        value?: unknown;
        label?: unknown;
      };

      if (typeof props.value === 'string' && typeof props.label === 'string') {
        result.push({ value: props.value, label: props.label });
      }

      if (props.children) {
        walk(props.children);
      }
    });
  };

  walk(children);
  return result;
}

export function Select({ value = '', onValueChange, children }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [triggerLayout, setTriggerLayout] = useState<SelectTriggerLayout | null>(null);
  const [registeredLabelsByValue, setRegisteredLabelsByValue] = useState<Record<string, string>>(
    {},
  );
  const collectedOptions = React.useMemo(() => collectSelectOptions(children), [children]);
  const registeredOptions = React.useMemo(
    () =>
      Object.entries(registeredLabelsByValue).map(([optionValue, optionLabel]) => ({
        value: optionValue,
        label: optionLabel,
      })),
    [registeredLabelsByValue],
  );
  const options = collectedOptions.length > 0 ? collectedOptions : registeredOptions;
  const labels = React.useMemo(
    () =>
      options.reduce<Record<string, string>>((acc, option) => {
        acc[option.value] = option.label;
        return acc;
      }, {}),
    [options],
  );
  const registerItem = React.useCallback((option: SelectOption) => {
    setRegisteredLabelsByValue((previous) => {
      if (previous[option.value] === option.label) {
        return previous;
      }
      return {
        ...previous,
        [option.value]: option.label,
      };
    });
  }, []);
  const unregisterItem = React.useCallback((optionValue: string) => {
    setRegisteredLabelsByValue((previous) => {
      if (!(optionValue in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[optionValue];
      return next;
    });
  }, []);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: onValueChange || (() => {}),
        open,
        setOpen,
        triggerLayout,
        setTriggerLayout,
        options,
        labels,
        registerItem,
        unregisterItem,
      }}
    >
      {children}
    </SelectContext.Provider>
  );
}

type SelectTriggerProps = {
  children: ReactNode;
  className?: string;
};

export function SelectTrigger({ children }: SelectTriggerProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const { LL, locale } = useI18nContext();
  const { value, onValueChange, open, setOpen, setTriggerLayout, options } = useSelectContext();
  const openLabel = SELECT_LABELS[locale].open;
  const placeholder = findSelectValuePlaceholder(children);
  const triggerRef = useRef<View>(null);

  const openAndroidMenu = () => {
    if (options.length === 0) {
      return;
    }

    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (focusedInput) {
      TextInput.State.blurTextInput(focusedInput);
    }

    requestAnimationFrame(() => {
      triggerRef.current?.measureInWindow((x, y, width, height) => {
        setTriggerLayout({ x, y, width, height });
        setOpen(true);
      });
    });
  };

  if (isAndroid) {
    return (
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          style={({ pressed }) => [
            styles.trigger,
            {
              borderColor: palette.inputBorder,
              backgroundColor: palette.background,
              opacity: pressed || open ? 0.82 : 1,
            },
          ]}
          onPress={openAndroidMenu}
          accessibilityRole="button"
          accessibilityLabel={openLabel}
        >
          {children}
          <IconSymbol name="chevron.down" size={16} color={palette.icon} />
        </Pressable>
      </View>
    );
  }

  return (
    <View ref={triggerRef} collapsable={false}>
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: palette.inputBorder,
            backgroundColor: palette.background,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
        onPress={() => {
          if (options.length === 0) {
            return;
          }

          const cancelButtonIndex = 0;
          const anchor = isPad ? findNodeHandle(triggerRef.current) : undefined;

          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: [
                LL.common.cancel(),
                ...options.map((option) =>
                  option.value === value ? `${option.label} \u2713` : option.label,
                ),
              ],
              cancelButtonIndex: cancelButtonIndex,
              title: placeholder,
              userInterfaceStyle: scheme,
              ...(anchor ? { anchor } : {}),
            },
            (buttonIndex) => {
              if (buttonIndex === undefined || buttonIndex === cancelButtonIndex) {
                return;
              }
              onValueChange(options[buttonIndex - 1]?.value ?? '');
            },
          );
        }}
        accessibilityRole="button"
        accessibilityLabel={openLabel}
      >
        {children}
        <IconSymbol name="chevron.down" size={16} color={palette.icon} />
      </Pressable>
    </View>
  );
}

type SelectValueProps = {
  placeholder?: string;
};

export function SelectValue({ placeholder }: SelectValueProps) {
  const { locale } = useI18nContext();
  const { labels, value } = useSelectContext();
  const selectedLabel = labels[value];
  const defaultPlaceholder = SELECT_LABELS[locale].placeholder;

  return (
    <ThemedText style={styles.value} numberOfLines={1} ellipsizeMode="tail">
      {selectedLabel || placeholder || defaultPlaceholder}
    </ThemedText>
  );
}
SelectValue.displayName = 'SelectValue';

type SelectContentProps = {
  children: ReactNode;
  className?: string;
  insets?: any;
};

export function SelectContent({ children }: SelectContentProps) {
  void children;
  const { locale } = useI18nContext();
  const { open, setOpen, triggerLayout, setTriggerLayout, options, value, onValueChange } =
    useSelectContext();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const window = useWindowDimensions();
  const closeLabel = SELECT_LABELS[locale].close;

  if (!isAndroid) {
    return null;
  }

  const closeMenu = () => {
    setOpen(false);
    setTriggerLayout(null);
  };

  const horizontalMargin = 16;
  const verticalMargin = 12;
  const optionCount = Math.max(options.length, 1);
  const estimatedMenuHeight = Math.min(320, optionCount * 52 + 12);
  const menuWidth = triggerLayout
    ? Math.min(Math.max(triggerLayout.width, 160), window.width - horizontalMargin * 2)
    : Math.min(240, window.width - horizontalMargin * 2);
  const menuLeft = triggerLayout
    ? Math.min(
        Math.max(triggerLayout.x, horizontalMargin),
        window.width - menuWidth - horizontalMargin,
      )
    : horizontalMargin;
  const spaceBelow = triggerLayout
    ? window.height - (triggerLayout.y + triggerLayout.height) - verticalMargin
    : 0;
  const spaceAbove = triggerLayout ? triggerLayout.y - verticalMargin : 0;
  const shouldOpenBelow = triggerLayout
    ? spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove
    : true;
  const maxMenuHeight = Math.max(
    120,
    Math.min(320, shouldOpenBelow ? spaceBelow : spaceAbove, window.height - verticalMargin * 2),
  );
  const menuTop = triggerLayout
    ? shouldOpenBelow
      ? Math.min(
          triggerLayout.y + triggerLayout.height + 4,
          window.height - Math.min(estimatedMenuHeight, maxMenuHeight) - verticalMargin,
        )
      : Math.max(verticalMargin, triggerLayout.y - Math.min(estimatedMenuHeight, maxMenuHeight) - 4)
    : verticalMargin;

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={closeMenu}
    >
      <View style={styles.overlay}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: palette.overlayBackdrop }]}
          onPress={closeMenu}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <ThemedView
          style={[
            styles.androidMenu,
            {
              top: menuTop,
              left: menuLeft,
              width: menuWidth,
              maxHeight: maxMenuHeight,
              backgroundColor: palette.background,
              borderColor: palette.inputBorder,
            },
          ]}
        >
          <ScrollView
            style={styles.androidOptionsList}
            contentContainerStyle={styles.androidOptionsContent}
          >
            {options.map((option, index) => (
              <Pressable
                key={option.value}
                style={[
                  styles.androidOptionButton,
                  index < options.length - 1
                    ? {
                        borderBottomColor: palette.inputBorder,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      }
                    : null,
                ]}
                onPress={() => {
                  onValueChange(option.value);
                  closeMenu();
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <ThemedText style={styles.androidOptionText}>{option.label}</ThemedText>
                {option.value === value ? (
                  <IconSymbol name="checkmark" size={18} color={palette.tint} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

type SelectGroupProps = {
  children: ReactNode;
};

export function SelectGroup({ children }: SelectGroupProps) {
  return <View style={styles.group}>{children}</View>;
}

type SelectLabelProps = {
  children: ReactNode;
};

export function SelectLabel({ children }: SelectLabelProps) {
  return <ThemedText style={styles.label}>{children}</ThemedText>;
}

type SelectItemProps = {
  value: string;
  label: string;
  children?: ReactNode;
};

export function SelectItem({ value: itemValue, label }: SelectItemProps) {
  const { registerItem, unregisterItem } = useSelectContext();

  React.useEffect(() => {
    registerItem({ value: itemValue, label });
    return () => unregisterItem(itemValue);
  }, [itemValue, label, registerItem, unregisterItem]);

  return null;
}
SelectItem.displayName = 'SelectItem';

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
    marginBottom: 12,
  },
  value: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  androidMenu: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  androidOptionsList: {
    flexGrow: 0,
  },
  androidOptionsContent: {
    paddingVertical: 4,
  },
  androidOptionButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  androidOptionText: {
    flex: 1,
    fontSize: 16,
  },
  group: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  itemText: {
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
});
