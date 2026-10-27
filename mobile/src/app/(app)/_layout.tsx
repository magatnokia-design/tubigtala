import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { SelectedDeviceProvider } from '@/hooks/use-selected-device';

export default function AppLayout() {
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
        <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
      </Stack>
    </SelectedDeviceProvider>
  );
}
