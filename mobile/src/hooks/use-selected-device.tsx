// The device the Water and Analytics tabs are showing. Defaults to the first device
// (sorted by name); the switcher appears only when an account has more than one.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Device } from '@/domain/types';
import { useOwnedDevices, type LoadState } from '@/hooks/use-devices';

interface SelectedDeviceState {
  devices: LoadState<Device[]>;
  /** null when the account has no devices (or they are still loading). */
  device: Device | null;
  select: (id: string) => void;
}

const SelectedDeviceContext = createContext<SelectedDeviceState>({
  devices: { status: 'loading' }, device: null, select: () => {},
});

export function SelectedDeviceProvider({ children }: { children: ReactNode }) {
  const devices = useOwnedDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const value = useMemo(() => {
    const list = devices.status === 'ready' ? devices.data : [];
    const device = list.find((d) => d.id === selectedId) ?? list[0] ?? null;
    return { devices, device, select: setSelectedId };
  }, [devices, selectedId]);

  return <SelectedDeviceContext.Provider value={value}>{children}</SelectedDeviceContext.Provider>;
}

export function useSelectedDevice() {
  return useContext(SelectedDeviceContext);
}
