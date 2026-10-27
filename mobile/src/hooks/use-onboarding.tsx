// Whether this phone has seen the "How to use TubigTala" slides. Stored on the device only
// (a per-device convenience, not account data); if storage fails, the slides simply show again.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'tubigtala.onboarding.v1';

interface OnboardingState {
  /** null while reading storage */
  seen: boolean | null;
  finish: () => void;
  replay: () => void;
}

const OnboardingContext = createContext<OnboardingState>({ seen: null, finish: () => {}, replay: () => {} });

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setSeen(v === 'done'))
      .catch(() => setSeen(false));
  }, []);

  const finish = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(KEY, 'done').catch(() => undefined);
  }, []);

  const replay = useCallback(() => setSeen(false), []);

  const value = useMemo(() => ({ seen, finish, replay }), [seen, finish, replay]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
