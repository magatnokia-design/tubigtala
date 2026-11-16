import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useNotificationPrompt } from '@/hooks/use-notification-prompt';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { SelectedDeviceProvider } from '@/hooks/use-selected-device';

export default function AppLayout() {
  useNotificationPrompt();
  usePushRegistration();
  return (
    <SelectedDeviceProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.light.tint },
          headerTintColor: Colors.light.onTint,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.light.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="edit-profile" options={{ title: 'Edit' }} />
        <Stack.Screen name="export" options={{ title: 'Export to Excel', presentation: 'modal' }} />
        <Stack.Screen name="calibrate-ph" options={{ title: 'Calibrate pH' }} />
        <Stack.Screen name="alert-limits" options={{ title: 'Alert limits' }} />
        <Stack.Screen name="pair-device" options={{ title: 'Add station' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      </Stack>
    </SelectedDeviceProvider>
  );
}
