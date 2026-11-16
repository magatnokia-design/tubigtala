// Alerts (users/{uid}/notifications) and phone notifications.
// Alerts are raised by the backend only (functions/src/readings.ts and stations.ts; since 0.9.4
// the app no longer raises any). The app lists them, marks them read and deletes them.
import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc,
  Timestamp, updateDoc, where, writeBatch, type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { rangeFromStored } from '@/domain/limits';
import { pushTokenId } from '@/domain/push';
import type { AppNotification } from '@/domain/types';
import { db } from '@/services/firebase';
import { emptyBecauseOffline } from '@/services/offline';

const inbox = (uid: string) => collection(db, 'users', uid, 'notifications');
const METRICS = ['ph', 'temperatureC', 'nh3GasMv'] as const;

function toNotification(id: string, d: Record<string, unknown>): AppNotification {
  const metric = METRICS.find((m) => m === d.metric) ?? null;
  return {
    id,
    title: typeof d.title === 'string' ? d.title : 'Notification',
    body: typeof d.body === 'string' ? d.body : '',
    deviceId: typeof d.deviceId === 'string' ? d.deviceId : null,
    metric,
    value: typeof d.value === 'number' ? d.value : null,
    level: d.level === 'warning' || d.level === 'critical' ? d.level : null,
    // The limits stored with the alert (0.9.4+); invalid or missing = the defaults (null).
    limits: metric ? rangeFromStored(metric, d.limits) : null,
    kind: d.kind === 'sensor' || d.kind === 'offline' || d.kind === 'online' ? d.kind : null,
    createdAtMs: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
    read: d.read === true,
  };
}

export function subscribeNotifications(
  uid: string, onData: (items: AppNotification[]) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  const q = query(inbox(uid), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    const offline = emptyBecauseOffline(snap);
    if (offline) return onError(offline);
    onData(snap.docs.map((s) => toNotification(s.id, s.data({ serverTimestamps: 'estimate' }))));
  }, onError);
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

// ---- Push from the backend (Firebase Cloud Messaging, since 0.9.2) ----
// The backend sends every alert to the phones registered here, so alerts arrive while the app
// is closed (functions/src/readings.ts). The app no longer shows its own pop-ups for alerts:
// with both, an open app would show each alert twice.

/** This phone's FCM registration token; null in Expo Go, off Android, without Firebase config, or on error. */
export async function devicePushToken(): Promise<string | null> {
  if (!phoneNotificationsSupported || Platform.OS !== 'android') return null;
  try {
    const Notifications = await notificationsModule();
    const t = await Notifications.getDevicePushTokenAsync();
    return typeof t.data === 'string' && t.data.length >= 20 ? t.data : null;
  } catch {
    return null;
  }
}

const tokenDoc = (uid: string, token: string) => doc(db, 'users', uid, 'pushTokens', pushTokenId(token));

/** Registers this phone with the backend. False when this phone has no push address. */
export async function registerPushToken(uid: string, token?: string | null): Promise<boolean> {
  const t = token ?? (await devicePushToken());
  if (!t) return false;
  await setDoc(tokenDoc(uid, t), {
    token: t,
    platform: 'android',
    appVersion: (Constants.expoConfig?.version ?? '').slice(0, 20),
    updatedAt: serverTimestamp(),
  });
  return true;
}

/** Stops alert notifications to this phone (sign-out, notifications switched off). */
export async function unregisterPushToken(uid: string): Promise<void> {
  const t = await devicePushToken();
  if (t) await deleteDoc(tokenDoc(uid, t));
}

/** FCM can replace a phone's token at any time; calls back with the new one. */
export async function onPushTokenChanged(cb: (token: string) => void): Promise<() => void> {
  if (!phoneNotificationsSupported || Platform.OS !== 'android') return () => undefined;
  const Notifications = await notificationsModule();
  const sub = Notifications.addPushTokenListener((t) => {
    if (typeof t.data === 'string') cb(t.data);
  });
  return () => sub.remove();
}
