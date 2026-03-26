import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="start" />
      <Stack.Screen name="language" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="vat" />
      <Stack.Screen name="currency" />
      <Stack.Screen name="done" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="restore" />
    </Stack>
  );
}
