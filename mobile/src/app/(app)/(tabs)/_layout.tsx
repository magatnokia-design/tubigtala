import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/tab-bar';

// Order matters: Analytics (left), Water (middle), Settings (right). Water is the start tab.
export const unstable_settings = { anchor: 'index' };

export default function TabsLayout() {
  return (
    <Tabs backBehavior="initialRoute" tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
