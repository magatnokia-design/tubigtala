import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

import { AppModal } from '@/components/app-modal';
import { Icon } from '@/components/icon';
import { LEVEL_COLORS, LevelChip } from '@/components/level-chip';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatAge, formatDateTime, formatNumber } from '@/domain/format';
import { classify, METRIC_INFO, normalRangeText } from '@/domain/thresholds';
import type { AppNotification } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useDialog } from '@/hooks/use-dialog';
import { useNow } from '@/hooks/use-now';
import { useNotifications } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { deleteNotification, markAllRead, markNotificationRead } from '@/services/notifications';

export default function NotificationsScreen() {
  const theme = useTheme();
  const now = useNow(30_000);
  const { user } = useAuth();
  const list = useNotifications();
  const dialog = useDialog();
  const { devices } = useSelectedDevice();
  const [open, setOpen] = useState<AppNotification | null>(null);

  const items = list.status === 'ready' ? list.data : [];
  const unread = items.filter((n) => !n.read).length;
  const deviceName = (id: string | null) => (devices.status === 'ready' ? devices.data.find((d) => d.id === id)?.name : undefined) ?? 'Device';

  function show(n: AppNotification) {
    setOpen(n);
    if (!n.read && user) markNotificationRead(user.uid, n.id).catch(() => undefined);
  }

  async function remove(n: AppNotification) {
    setOpen(null);
    const ok = await dialog.confirm({ tone: 'danger', title: 'Delete this notification?', confirmLabel: 'Delete' });
    if (ok && user) {
      await deleteNotification(user.uid, n.id).catch(() =>
        dialog.notify({ tone: 'danger', title: 'Could not delete', message: 'Check your connection and try again.' }));
    }
  }

  async function readAll() {
    if (!user || !unread) return;
    await markAllRead(user.uid, items).catch(() =>
      dialog.notify({ tone: 'danger', title: 'Could not update', message: 'Check your connection and try again.' }));
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={readAll} disabled={!unread} hitSlop={10} accessibilityLabel="Mark all as read" style={[styles.headerButton, !unread && styles.disabled]}>
              <Icon name="done_all" color="onTint" />
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>Read all</ThemedText>
            </Pressable>
          ),
        }}
      />
      {list.status === 'loading' && <ActivityIndicator style={styles.loading} color={theme.tint} />}
      {list.status === 'error' && <View style={styles.pad}><Notice tone="warning">{list.message}</Notice></View>}
      {list.status === 'ready' && (
        <FlatList
          style={{ backgroundColor: theme.background }}
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.content}
          ListHeaderComponent={items.length ? (
            <ThemedText type="small" themeColor="textSecondary">{unread ? `${unread} unread · hold to delete` : 'All read · hold to delete'}</ThemedText>
          ) : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
                <Icon name="notifications_none" size={40} />
              </View>
              <ThemedText type="smallBold" style={styles.emptyTitle}>No notifications</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Alerts about your water will show up here.</ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const c = LEVEL_COLORS[item.level ?? 'unknown'];
            return (
              <Pressable
                onPress={() => show(item)}
                onLongPress={() => remove(item)}
                style={({ pressed }) => [
                  styles.item,
                  { borderColor: item.read ? theme.border : theme[c.fg], backgroundColor: pressed ? theme.backgroundSelected : item.read ? theme.background : theme[c.bg] },
                ]}>
                <View style={[styles.itemIcon, { backgroundColor: item.read ? theme.backgroundElement : theme.background }]}>
                  <Icon name={item.level === 'critical' ? 'error' : 'warning'} size={20} color={item.read ? 'textSecondary' : c.fg} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{item.body}</ThemedText>
                </View>
                <View style={styles.itemRight}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.time}>{item.createdAtMs ? formatAge(now - item.createdAtMs) : ''}</ThemedText>
                  {!item.read && <View style={[styles.dot, { backgroundColor: theme.tint }]} />}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {open && (
        <AppModal
          visible
          onClose={() => setOpen(null)}
          tone={open.level === 'critical' ? 'danger' : 'warning'}
          title={open.title}
          actions={[
            { label: 'Close', onPress: () => setOpen(null) },
            { label: 'Delete', onPress: () => remove(open), variant: 'text' },
          ]}>
          <View style={[styles.details, { borderColor: theme.border }]}>
            {open.metric && open.level && (
              <Detail label="Status" value={<LevelChip level={open.level} label={classify(open.metric, open.value).label} compact />} />
            )}
            {open.metric && (
              <Detail
                label="Reading"
                value={`${formatNumber(open.value, METRIC_INFO[open.metric].decimals)}${METRIC_INFO[open.metric].unit ? ` ${METRIC_INFO[open.metric].unit}` : ''}`}
              />
            )}
            {open.metric && <Detail label="Normal range" value={normalRangeText(open.metric)} />}
            <Detail label="Device" value={deviceName(open.deviceId)} />
            <Detail label="Time" value={open.createdAtMs ? formatDateTime(open.createdAtMs) : '—'} />
          </View>
        </AppModal>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | ReactElement }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      {typeof value === 'string' ? <ThemedText type="smallBold" style={styles.detailValue}>{value}</ThemedText> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { marginTop: Spacing.six },
  pad: { padding: Spacing.four },
  flex: { flex: 1 },
  disabled: { opacity: 0.4 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  content: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.six },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, lineHeight: 24 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderWidth: 1, borderRadius: Radius.card },
  itemIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  itemRight: { alignItems: 'flex-end', gap: Spacing.one },
  time: { fontSize: 12, lineHeight: 16 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  details: { borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: Spacing.two },
  detailValue: { flexShrink: 1, textAlign: 'right' },
});
