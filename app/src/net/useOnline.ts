import { useNetworkState } from 'expo-network';

// False only when Android says there is no connection or no internet. Unknown counts
// as online, so the app never blocks itself on a slow first check.
export function useOnline(): boolean {
  const net = useNetworkState();
  return net.isConnected !== false && net.isInternetReachable !== false;
}
