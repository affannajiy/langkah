import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '../../auth/AuthProvider';

// Top up needs a Google or demo account (guide Section 15.2). A guest gets the
// sign-in sheet first; signing in carries on to the top-up.
export function useOpenTopUp() {
  const router = useRouter();
  const { isFull, demo, requireSignIn } = useAuth();
  return useCallback(async () => {
    if (!isFull && !demo.isDemo && !(await requireSignIn('topup'))) return;
    router.push('/topup');
  }, [isFull, demo.isDemo, requireSignIn, router]);
}
