// Alerts (users/{uid}/notifications) and phone notifications.
// Alerts are raised by services/alerts.ts (in a transaction with the shared alert state).
import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query,
  Timestamp, updateDoc, where, writeBatch, type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { AppNotification } from '@/domain/types';
import { db } from '@/services/firebase';

const inbox = (uid: string) => collection(db, 'users', uid, 'notifications');
const METRICS = ['ph', 'temperatureC', 'nh3GasMv'] as const;

function toNotification(id: string, d: Record<string, unknown>): AppNotification {
  return {
    id,
    title: typeof d.title === 'string' ? d.title : 'Notification',
    body: typeof d.body === 'string' ? d.body : '',
    deviceId: typeof d.deviceId === 'string' ? d.deviceId : null,
    metric: METRICS.find((m) => m === d.metric) ?? null,
    value: typeof d.value === 'number' ? d.value : null,
    level: d.level === 'warning' || d.level === 'critical' ? d.level : null,
    createdAtMs: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
    read: d.read === true,
  };
}

export function subscribeNotifications(
  uid: string, onData: (items: AppNotification[]) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  const q = query(inbox(uid), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => onData(snap.docs.map((s) => toNotification(s.id, s.data({ serverTimestamps: 'estimate' })))), onError);
}

/** Alerts for one device in a time range (exports). Filtered by device here to avoid a composite index. */
export async function fetchAlertsBetween(uid: string, deviceId: string, startMs: number, endMs: number): Promise<AppNotification[]> {
  const q = query(inbox(uid), where('createdAt', '>=', Timestamp.fromMillis(startMs)), where('createdAt', '<=', Timestamp.fromMillis(endMs)), orderBy('createdAt', 'asc'), limit(500));
  return (await getDocs(q)).docs.map((s) => toNotification(s.id, s.data())).filter((n) => n.deviceId === deviceId);
}

export function markNotificationRead(uid: string, id: string): Promise<void> {
  return updateDoc(doc(inbox(uid), id), { read: true });
}

export async function markAllRead(uid: string, items: AppNotification[]): Promise<void> {
  const unread = items.filter((n) => !n.read);
  for (let i = 0; i < unread.length; i += 400) {
    const batch = writeBatch(db);
    for (const n of unread.slice(i, i + 400)) batch.update(doc(inbox(uid), n.id), { read: true });
    await batch.commit();
  }
}

export function deleteNotification(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(inbox(uid), id));
}

// ---- Android notification permission and local (on-phone) notifications ----
// expo-notifications is loaded on demand: Expo Go on Android lacks push support and warns
// when the module loads.

/**
 * Expo Go on Android (SDK 58) cannot load expo-notifications at all - its native modules are
 * missing and the import throws. Phone notifications therefore only work in the installed APK;
 * in Expo Go the app skips them instead of crashing.
 */
export const phoneNotificationsSupported =
  !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let handlerSet = false;
async function notificationsModule() {
  if (!phoneNotificationsSupported) throw new Error('Phone notifications are not available in Expo Go');
  const Notifications = await import('expo-notifications');
  if (!handlerSet) {
    handlerSet = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alerts', { name: 'Water alerts', importance: Notifications.AndroidImportance.HIGH });
    }
  }
  return Notifications;
}

export type PermissionResult = 'granted' | 'denied' | 'blocked' | 'unavailable';

/**
 * Asks Android for the notification permission (Android 13+ shows a dialog; older versions
 * grant it at install). 'blocked' = the user said no before and Android will not ask again,
 * so only the system settings can change it.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (!phoneNotificationsSupported) return 'unavailable';
  const Notifications = await notificationsModule();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const asked = await Notifications.requestPermissionsAsync();
  if (asked.granted) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
}

export async function notificationPermissionGranted(): Promise<boolean> {
  if (!phoneNotificationsSupported) return false;
  const Notifications = await notificationsModule();
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Shows a notification on this phone now (no server involved). */
export async function showPhoneNotification(title: string, body: string): Promise<void> {
  if (!phoneNotificationsSupported) return;
  const Notifications = await notificationsModule();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, ...(Platform.OS === 'android' ? { channelId: 'alerts' } : {}) },
    trigger: null,
  });
}
