import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { myNotices, noticesSeen } from '../api/notices';
import { dailyCheckin, demoReset, demoStart, isDemoUser } from '../api/points';
import { supabase } from '../api/supabase';
import { notifyPoints } from '../points/notice';
import { clearRecentPlaces, clearStarred, requestMapHome } from '../storage/places';
import { flushQueue } from '../storage/reportQueue';
import { SignInSheet, type SignInReason } from './SignInSheet';

// Who the user is (guide Section 5.2, screen 12; kickoff Phase 5):
// - Everyone starts as a guest: a Supabase anonymous account, made silently. Guests read.
// - Google sign-in is asked for only at the first report or vote, in a sheet. The guest
//   account is linked to Google, so it keeps its id.
// - Anything queued on the phone is sent right after sign-in.
// - The demo account (Phase 10, guide Section 15): while the server's demo switch is
//   on, "Try the demo" makes a fresh guest and the server fills it as Demo Walker.
//   That guest may write without Google. The server decides; the app only stops
//   asking for sign-in.
// - Daily check-in: the first open each Malaysian day earns points.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (webClientId) GoogleSignin.configure({ webClientId });

export type SignInResult = 'ok' | 'cancelled' | 'no_play_services' | 'not_configured' | 'failed';

type AuthState = {
  ready: boolean;
  hasSession: boolean; // any session, guest included; none when guest sign-in failed
  isFull: boolean; // signed in with Google
  canWrite: boolean; // signed in with Google, or the demo account
  name: string | null;
  // available: the server's demo switch is on. isDemo: this account is Demo Walker.
  demo: { available: boolean; isDemo: boolean };
  signInGoogle: () => Promise<SignInResult>; // the welcome screen's button
  startDemo: () => Promise<boolean>;
  resetDemo: () => Promise<boolean>;
  // Opens the sign-in sheet if needed. Resolves true once the user may write.
  requireSignIn: (reason: SignInReason) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth needs AuthProvider');
  return auth;
}

const isFullSession = (s: Session | null) => !!s && !s.user.is_anonymous;

async function ensureGuest(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  // Offline or rate limited: reading still works with the public key. Try again later.
  if (error) console.warn('Guest sign-in failed', error.message);
}

// The server's switches (migration 10). Off when unknown, for example offline.
async function demoAvailable(): Promise<boolean> {
  const { data, error } = await supabase.rpc('app_status');
  if (error) return false;
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).demo === true;
}

// The Malaysian date, for the once-a-day check-in.
const malaysiaDay = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// fresh: sign in without linking (leaving the demo account, which stays behind).
async function signInWithGoogle(fresh = false): Promise<SignInResult> {
  if (!webClientId) return 'not_configured';
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return 'cancelled';
    const token = response.data.idToken;
    if (!token) return 'failed';

    const { data } = await supabase.auth.getSession();
    if (data.session?.user.is_anonymous && !fresh) {
      // Keep the guest's id: link Google to it.
      const linked = await supabase.auth.linkIdentity({ provider: 'google', token });
      if (linked.error) {
        // This Google account already has a Langkah account: sign in to that one.
        // The guest's points stay behind (the sign-in sheet says guest points live
        // only on this phone).
        if (linked.error.code !== 'identity_already_exists') {
          console.warn('Linking Google failed', linked.error.message);
          return 'failed';
        }
        const signedIn = await supabase.auth.signInWithIdToken({ provider: 'google', token });
        if (signedIn.error) return 'failed';
      } else {
        // New token, so is_anonymous = false reaches RLS.
        await supabase.auth.refreshSession();
      }
    } else {
      const signedIn = await supabase.auth.signInWithIdToken({ provider: 'google', token });
      if (signedIn.error) return 'failed';
    }
    return 'ok';
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'no_play_services';
      if (error.code === statusCodes.IN_PROGRESS) return 'cancelled';
    }
    console.warn('Google sign-in failed', error);
    return 'failed';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SignInReason | null>(null);
  const [demoServer, setDemoServer] = useState(false);
  const [demoFor, setDemoFor] = useState<string | null>(null); // the user id known to be the demo account
  const waiting = useRef<((ok: boolean) => void) | null>(null);
  const checkedIn = useRef<string | null>(null);
  const isFull = isFullSession(session);
  const userId = session?.user.id ?? null;
  const isGuest = !!session?.user.is_anonymous;
  const isDemo = !!userId && isGuest && demoFor === userId;
  const canWrite = isFull || (demoServer && isDemo);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    ensureGuest().finally(async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setReady(true);
    });
    void demoAvailable().then(setDemoServer);
    // Back online after a failed guest sign-in; the demo switch may have changed too.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void ensureGuest();
      void demoAvailable().then(setDemoServer);
    });
    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  // Signed in with Google: refresh the shown name. Allowed to write: send anything queued.
  useEffect(() => {
    if (!isFull) {
      setName(null);
      return;
    }
    supabase.rpc('sync_profile').then(({ data }) => setName(typeof data === 'string' ? data : null));
  }, [isFull, session?.user.id]);

  useEffect(() => {
    if (canWrite) void flushQueue();
  }, [canWrite, session?.user.id]);

  // Is this guest the demo account? Asked again for each new account.
  useEffect(() => {
    if (!userId || !isGuest) return;
    let live = true;
    isDemoUser()
      .then((on) => {
        if (live) setDemoFor((prev) => (on ? userId : prev === userId ? null : prev));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId, isGuest]);

  // Daily check-in: on start, after a sign-in, and when the app comes back the next day.
  useEffect(() => {
    if (!userId) return;
    const checkIn = () => {
      const day = malaysiaDay();
      if (checkedIn.current === `${userId}:${day}`) return;
      checkedIn.current = `${userId}:${day}`;
      dailyCheckin()
        .then((r) => {
          if (r.points > 0) notifyPoints({ kind: 'checkin', points: r.points, day: r.day });
        })
        // Then council news on the user's requests (Phase 21), newest last, after the
        // check-in snackbar has had its turn.
        .finally(() => {
          myNotices()
            .then((list) => {
              const last = list[list.length - 1];
              if (!last) return;
              setTimeout(() => {
                notifyPoints({
                  kind: 'council',
                  status: last.kind,
                  category: last.category,
                  street: last.street,
                  points: last.points,
                  more: list.length - 1,
                });
              }, 3500);
              return noticesSeen(list.map((n) => n.id));
            })
            .catch((error: unknown) => console.warn('Notices failed', error));
        })
        .catch((error: unknown) => {
          checkedIn.current = null; // try again on the next open
          console.warn('Daily check-in failed', error);
        });
    };
    checkIn();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkIn();
    });
    return () => sub.remove();
  }, [userId]);

  const finish = useCallback((ok: boolean) => {
    setSheet(null);
    waiting.current?.(ok);
    waiting.current = null;
  }, []);

  const requireSignIn = useCallback(
    (reason: SignInReason) => {
      if (canWrite) return Promise.resolve(true);
      waiting.current?.(false);
      setSheet(reason);
      return new Promise<boolean>((resolve) => {
        waiting.current = resolve;
      });
    },
    [canWrite],
  );

  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Not signed in to Google on this phone: nothing to do.
    }
    await supabase.auth.signOut();
    await ensureGuest();
  }, []);

  const signInGoogle = useCallback(() => signInWithGoogle(isDemo), [isDemo]);

  // "Try the demo": a fresh guest, filled by the server as Demo Walker.
  const startDemo = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await ensureGuest();
      await demoStart();
      const { data } = await supabase.auth.getSession();
      setDemoFor(data.session?.user.id ?? null);
      return true;
    } catch (error) {
      console.warn('Could not start the demo', error);
      return false;
    }
  }, []);

  // Reset demo: the server puts both demo accounts back; the phone forgets recent
  // searches and the map goes back to Ipoh Railway Station. The language stays.
  const resetDemo = useCallback(async () => {
    try {
      await demoReset();
      await clearRecentPlaces();
      await clearStarred();
      requestMapHome();
      return true;
    } catch (error) {
      console.warn('Could not reset the demo', error);
      return false;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      hasSession: !!session,
      isFull,
      canWrite,
      name,
      demo: { available: demoServer, isDemo },
      signInGoogle,
      startDemo,
      resetDemo,
      requireSignIn,
      signOut,
    }),
    [ready, session, isFull, canWrite, name, demoServer, isDemo, signInGoogle, startDemo, resetDemo, requireSignIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInSheet
        reason={sheet}
        showDemo={demoServer && !isDemo && !isFull}
        onSignIn={async () => {
          const result = await signInWithGoogle(isDemo);
          if (result === 'ok') finish(true);
          return result;
        }}
        onDemo={async () => {
          const ok = await startDemo();
          if (ok) finish(true);
          return ok;
        }}
        onClose={() => finish(false)}
      />
    </AuthContext.Provider>
  );
}
