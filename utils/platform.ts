import { Platform } from 'react-native';

export const isIos = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';
export const isPad = isIos && (Platform as typeof Platform & { isPad?: boolean }).isPad === true;
