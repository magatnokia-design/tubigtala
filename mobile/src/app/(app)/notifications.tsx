import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatDateTime } from '@/domain/format';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { markNotificationRead } from '@/services/notifications';

export default function NotificationsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const list = useNotifications();

  if (list.status === 'loading') return <ActivityIndicator style={styles.loading} color={theme.tint} />;
  if (list.status === 'error') return <View style={styles.pad}><Notice tone="warning">{list.message}</Notice></View>;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      data={list.data}
      keyExtractor={(n) => n.id}
      contentContainerStyle={styles.content}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
            <Icon name="notifications_none" size={40} />
          </View>
          <ThemedText type="smallBold" style={styles.emptyTitle}>No notifications yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Alerts about your water will show up here.
          </ThemedText>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => { if (!item.read && user) markNotificationRead(user.uid, item.id).catch(() => undefined); }}
          style={[styles.item, { borderColor: theme.border, backgroundColor: item.read ? theme.background : theme.backgroundElement }]}>
          <Icon name={item.read ? 'notifications' : 'notifications_active'} color={item.read ? 'textSecondary' : 'tint'} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{item.title}</ThemedText>
            <ThemedText type="small">{item.body}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{item.createdAtMs ? formatDateTime(item.createdAtMs) : ''}</ThemedText>
          </View>
          {!item.read && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  pad: { padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.two, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.six, paddingHorizontal: Spacing.four },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, lineHeight: 24 },
  center: { textAlign: 'center' },
  item: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderWidth: 1, borderRadius: Radius.card, alignItems: 'flex-start' },
  flex: { flex: 1, gap: Spacing.half },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
