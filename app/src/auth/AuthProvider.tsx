import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '../api/supabase';
import { flushQueue } from '../storage/reportQueue';
import { updateSettings, useSettings } from '../storage/settings';
import { SignInSheet, type SignInReason } from './SignInSheet';

// Who the user is (guide Section 5.2, screen 12; kickoff Phase 5):
// - Everyone starts as a guest: a Supabase anonymous account, made silently. Guests read.
// - Google sign-in is asked for only at the first report or vote, in a sheet. The guest
//   account is linked to Google, so it keeps its id.
// - Anything queued on the phone is sent right after sign-in.
// - Demo mode (Phase 6): while the server's demo switch is on and the user turned on
//   Demo mode in Settings, guests write without Google. The server decides; the app
//   only stops asking for sign-in.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
if (webClientId) GoogleSignin.configure({ webClientId });

export type SignInResult = 'ok' | 'cancelled' | 'no_play_services' | 'not_configured' | 'failed';

type AuthState = {
  ready: boolean;
  hasSession: boolean; // any session, guest included; none when guest sign-in failed
  isFull: boolean; // signed in with Google
  canWrite: boolean; // signed in with Google, or a guest in demo mode
  name: string | null;
  demo: { available: boolean; on: boolean }; // available: the server allows demo writes
  setDemo: (on: boolean) => void;
  newGuest: () => Promise<void>; // demo mode: start again as a different guest
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

async function signInWithGoogle(): Promise<SignInResult> {
  if (!webClientId) return 'not_configured';
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return 'cancelled';
    const token = response.data.idToken;
    if (!token) return 'failed';

    const { data } = await supabase.auth.getSession();
    if (data.session?.user.is_anonymous) {
      // Keep the guest's id: link Google to it.
      const linked = await supabase.auth.linkIdentity({ provider: 'google', token });
      if (linked.error) {
        // This Google account already has a Langkah account: sign in to that one.
        // Guests cannot write, so the guest account has nothing worth keeping.
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
  const waiting = useRef<((ok: boolean) => void) | null>(null);
  const { demoMode } = useSettings();
  const isFull = isFullSession(session);
  const demoOn = demoServer && demoMode && !!session;
  const canWrite = isFull || demoOn;

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

  // A fresh guest id, so one emulator can act as a second voter in demo mode.
  const newGuest = useCallback(async () => {
    await supabase.auth.signOut();
    await ensureGuest();
  }, []);

  const setDemo = useCallback((on: boolean) => updateSettings({ demoMode: on }), []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      hasSession: !!session,
      isFull,
      canWrite,
      name,
      demo: { available: demoServer, on: demoOn },
      setDemo,
      newGuest,
      requireSignIn,
      signOut,
    }),
    [ready, session, isFull, canWrite, name, demoServer, demoOn, setDemo, newGuest, requireSignIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInSheet
        reason={sheet}
        onSignIn={async () => {
          const result = await signInWithGoogle();
          if (result === 'ok') finish(true);
          return result;
        }}
        onClose={() => finish(false)}
      />
    </AuthContext.Provider>
  );
}
