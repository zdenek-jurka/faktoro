// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { isIos } from '@/utils/platform';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'line.3.horizontal': 'menu',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'person.badge.plus': 'person-add',
  magnifyingglass: 'search',
  'person.3.fill': 'person',
  'trash.fill': 'delete-forever',
  pencil: 'edit',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',
  plus: 'add',
  'plus.circle.fill': 'add-circle',
  'doc.badge.plus': 'post-add',
  'doc.text': 'description',
  'doc.text.fill': 'description',
  'doc.richtext.fill': 'article',
  envelope: 'email',
  'note.text': 'note',
  percent: 'percent',
  phone: 'phone',
  'person.3': 'groups',
  'clock.fill': 'schedule',
  clock: 'schedule',
  'chart.bar.fill': 'bar-chart',
  'play.fill': 'play-arrow',
  'pause.fill': 'pause',
  'stop.fill': 'stop',
  'lock.fill': 'lock',
  'receipt.fill': 'receipt-long',
  'ellipsis.circle.fill': 'more-horiz',
  'gearshape.fill': 'settings',
  network: 'public',
  'building.columns.fill': 'account-balance',
  checkmark: 'check',
  'checkmark.square.fill': 'check-box',
  square: 'check-box-outline-blank',
  'chevron.up': 'keyboard-arrow-up',
  'chevron.down': 'keyboard-arrow-down',
  tag: 'local-offer',
  'tag.fill': 'local-offer',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle | ViewStyle>;
  weight?: SymbolWeight;
}) {
  if (isIos) {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={weight}
        style={style as StyleProp<ViewStyle>}
        fallback={<MaterialIcons color={color} size={size} name={MAPPING[name]} />}
      />
    );
  }

  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style as StyleProp<TextStyle>}
    />
  );
}
