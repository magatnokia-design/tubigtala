// True while the app is on screen (not in the background). Live queries that only matter to
// someone looking at them (Analytics) stop in the background, so a phone that leaves the app open
// behind other apps does not keep reading from Firestore.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);
  return active;
}
