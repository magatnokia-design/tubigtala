import { Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '@/components/icon';
import { Colors } from '@/constants/theme';
import { signOut } from '@/services/auth';

export default function AppLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.light.tint },
          headerTintColor: Colors.light.onTint,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.light.background },
        }}>
        <Stack.Screen
          name="index"
          options={{
            title: 'My devices',
            headerRight: () => (
              <Pressable onPress={() => signOut()} hitSlop={10} accessibilityLabel="Sign out">
                <Icon name="logout" color="onTint" />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="device/[id]" options={{ title: 'Device' }} />
      </Stack>
    </>
  );
}
