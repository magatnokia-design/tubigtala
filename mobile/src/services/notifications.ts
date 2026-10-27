// In-app notifications (users/{uid}/notifications) and the Android notification permission.
// Nothing creates notifications yet: the alert backend (Cloud Functions, needs Blaze) will.
import {
  collection, doc, limit, onSnapshot, orderBy, query, Timestamp, updateDoc,
  type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import type { AppNotification } from '@/domain/types';
import { db } from '@/services/firebase';

export function subscribeNotifications(
  uid: string, onData: (items: AppNotification[]) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, (snap) => onData(snap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      title: typeof d.title === 'string' ? d.title : 'Notification',
      body: typeof d.body === 'string' ? d.body : '',
      deviceId: typeof d.deviceId === 'string' ? d.deviceId : null,
      createdAtMs: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0,
      read: d.read === true,
    };
  })), onError);
}

export function markNotificationRead(uid: string, id: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
}

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/**
 * Asks Android for the notification permission (Android 13+ shows a dialog; older versions
 * grant it at install). 'blocked' = the user said no before and Android will not ask again,
 * so only the system settings can change it.
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  // Loaded on demand: Expo Go on Android lacks push support and warns when the module loads.
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Water alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const asked = await Notifications.requestPermissionsAsync();
  if (asked.granted) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
}

export async function notificationPermissionGranted(): Promise<boolean> {
  const Notifications = await import('expo-notifications');
  return (await Notifications.getPermissionsAsync()).granted;
}
