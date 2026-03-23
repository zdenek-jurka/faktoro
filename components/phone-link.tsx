import * as Linking from 'expo-linking';
import { ThemedText } from './themed-text';

type Props = {
  phone?: string | null;
};

export function PhoneLink({ phone }: Props) {
  if (!phone) return null;

  const normalized = phone.replace(/\s+/g, '');
  return (
    <ThemedText type="link" onPress={() => Linking.openURL(`tel:${normalized}`)}>
      {phone}
    </ThemedText>
  );
}
