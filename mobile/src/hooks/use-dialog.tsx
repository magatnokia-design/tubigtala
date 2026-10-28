// App-styled replacement for Alert.alert: `await confirm({...})` resolves true/false,
// `notify({...})` shows a message with one OK button. One provider at the root.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { AppModal, type ModalTone } from '@/components/app-modal';

interface DialogOptions {
  title: string;
  message?: string;
  tone?: ModalTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogApi {
  confirm: (o: DialogOptions) => Promise<boolean>;
  notify: (o: DialogOptions) => Promise<void>;
}

const DialogContext = createContext<DialogApi>({
  confirm: async () => false,
  notify: async () => {},
});

export function DialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(DialogOptions & { kind: 'confirm' | 'notify' }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setCurrent(null);
  }, []);

  const api = useMemo<DialogApi>(() => ({
    confirm: (o) => new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setCurrent({ ...o, kind: 'confirm' });
    }),
    notify: (o) => new Promise<void>((resolve) => {
      resolver.current?.(false);
      resolver.current = () => resolve();
      setCurrent({ ...o, kind: 'notify' });
    }),
  }), []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AppModal
        visible={current !== null}
        onClose={() => close(false)}
        tone={current?.tone}
        title={current?.title ?? ''}
        message={current?.message}
        actions={current?.kind === 'confirm'
          ? [
              { label: current.confirmLabel ?? 'OK', onPress: () => close(true) },
              { label: current.cancelLabel ?? 'Cancel', onPress: () => close(false), variant: 'text' },
            ]
          : [{ label: current?.confirmLabel ?? 'OK', onPress: () => close(true) }]}
      />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}
