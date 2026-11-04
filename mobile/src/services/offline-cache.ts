// Last-known data kept on the phone (AsyncStorage) so the app can open and show something
// with no connection. Firestore's own cache lives in memory only on React Native and is lost
// when the app closes. Values are JSON; failures are ignored (worst case: nothing cached).
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'tubigtala.cache.v1.';

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => undefined);
}
