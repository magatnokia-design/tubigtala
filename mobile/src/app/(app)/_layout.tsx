import { Stack } from 'expo-router';

import { AlertWatchers } from '@/components/alert-watcher';
import { Colors } from '@/constants/theme';
import { useNotificationPrompt } from '@/hooks/use-notification-prompt';
import { SelectedDeviceProvider } from '@/hooks/use-selected-device';

export default function AppLayout() {
  useNotificationPrompt();
  return (
    <SelectedDeviceProvider>
      <AlertWatchers />
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
      </Stack>
    </SelectedDeviceProvider>
  );
}
