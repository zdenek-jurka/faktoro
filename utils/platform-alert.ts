import { Alert, type AlertButton, type AlertOptions } from 'react-native';
import { isWeb } from '@/utils/platform';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
};

export function showAlert(title: string, message: string): void {
  if (isWeb && typeof globalThis.alert === 'function') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

export async function showConfirm(options: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmText, cancelText, destructive } = options;

  if (isWeb && typeof globalThis.confirm === 'function') {
    return globalThis.confirm(`${title}\n\n${message}`);
  }

  return new Promise((resolve) => {
    const buttons: AlertButton[] = [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ];
    const alertOptions: AlertOptions = { cancelable: true, onDismiss: () => resolve(false) };
    Alert.alert(title, message, buttons, alertOptions);
  });
}
