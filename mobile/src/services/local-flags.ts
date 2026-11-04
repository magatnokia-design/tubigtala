// Per-account flags stored on this phone only (AsyncStorage): "has seen onboarding" and
// "was asked for the notification permission". Not account data - a new phone asks again.
// If storage fails, reads return false, so the worst case is showing something twice.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalFlag = 'onboarding' | 'notificationPrompt';

const key = (flag: LocalFlag, uid: string) => `tubigtala.${flag}.v2.${uid}`;

export async function getFlag(flag: LocalFlag, uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(flag, uid))) === 'done';
  } catch {
    return false;
  }
}

export async function setFlag(flag: LocalFlag, uid: string): Promise<void> {
  await AsyncStorage.setItem(key(flag, uid), 'done').catch(() => undefined);
}
