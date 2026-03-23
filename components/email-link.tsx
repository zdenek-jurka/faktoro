import * as Linking from 'expo-linking';
import { ThemedText } from './themed-text';

type Props = {
  email?: string | null;
};

export function EmailLink({ email }: Props) {
  if (!email) return null;

  return (
    <ThemedText type="link" onPress={() => Linking.openURL(`mailto:${email}`)}>
      {email}
    </ThemedText>
  );
}
