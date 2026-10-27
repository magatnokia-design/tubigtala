import { useNetworkState } from 'expo-network';

/**
 * false when the phone has no connection or no internet. While the state is still unknown
 * (first moments after launch) this reports online, so nothing flashes "offline".
 */
export function useOnline(): boolean {
  const net = useNetworkState();
  if (net.isConnected === false) return false;
  if (net.isInternetReachable === false) return false;
  return true;
}
