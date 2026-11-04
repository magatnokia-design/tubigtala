// Whether the signed-in account has seen the onboarding slides on this phone. Shown once per
// account, after sign-up / first sign-in (not on install).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { getFlag, setFlag } from '@/services/local-flags';

interface OnboardingState {
  /** null while reading storage, or when nobody is signed in */
  seen: boolean | null;
  finish: () => void;
}

const OnboardingContext = createContext<OnboardingState>({ seen: null, finish: () => {} });

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const uid = useAuth().user?.uid ?? null;
  const [state, setState] = useState<{ uid: string; seen: boolean } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getFlag('onboarding', uid).then((seen) => alive && setState({ uid, seen }));
    return () => { alive = false; };
  }, [uid]);

  const finish = useCallback(() => {
    if (!uid) return;
    setState({ uid, seen: true });
    setFlag('onboarding', uid);
  }, [uid]);

  // Ignore a result that belongs to a previously signed-in account.
  const seen = uid && state?.uid === uid ? state.seen : null;
  const value = useMemo(() => ({ seen, finish }), [seen, finish]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
