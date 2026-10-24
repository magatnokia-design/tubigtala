import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { subscribeAuth, type User } from '@/services/auth';

interface AuthState {
  user: User | null;
  /** True until Firebase has restored (or not) the saved session. */
  initializing: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, initializing: true });
  useEffect(() => subscribeAuth((user) => setState({ user, initializing: false })), []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
