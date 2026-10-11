import type { LngLat } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  castVote,
  communityReports,
  PAGE_SIZE,
  reportDetail,
  ReportError,
  type CommunityReport,
  type CommunitySort,
  type Vote,
} from '../../api/reports';
import type { ReportKind } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';

type ListState = {
  items: CommunityReport[];
  status: 'loading' | 'ready' | 'error';
  more: boolean; // another page may exist
  loadingMore: boolean;
};

// The Community list, one page of 30 at a time (Section 7.4: no bulk download).
export function useCommunityList(kind: ReportKind, sort: CommunitySort, near: LngLat | null) {
  const [state, setState] = useState<ListState>({ items: [], status: 'loading', more: false, loadingMore: false });
  const abort = useRef<AbortController | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Nearest needs a position; the other sorts only use it for distances.
  const nearKey = near ? `${near[0].toFixed(3)},${near[1].toFixed(3)}` : '';

  useEffect(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState((s) => ({ ...s, status: 'loading' }));
    communityReports({ kind, sort, near }, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setState({ items, status: 'ready', more: items.length === PAGE_SIZE, loadingMore: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ items: [], status: 'error', more: false, loadingMore: false });
      });
    return () => controller.abort();
    // near is read through nearKey, so small GPS jitter does not reload the list.
  }, [kind, sort, nearKey, reloadKey]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.more || s.loadingMore || s.status !== 'ready') return;
    setState({ ...s, loadingMore: true });
    communityReports({ kind, sort, near, offset: s.items.length })
      .then((page) =>
        setState((cur) => ({
          ...cur,
          items: [...cur.items, ...page.filter((p) => !cur.items.some((i) => i.id === p.id))],
          more: page.length === PAGE_SIZE,
          loadingMore: false,
        })),
      )
      .catch(() => setState((cur) => ({ ...cur, loadingMore: false })));
  }, [kind, sort, near]);

  const replace = useCallback((r: CommunityReport) => {
    setState((s) => ({ ...s, items: s.items.map((i) => (i.id === r.id ? r : i)) }));
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, loadMore, replace, reload };
}

export type VoteOutcome = { report: CommunityReport | null; error?: 'not_signed_in' | 'network' | 'not_allowed' };

// Asks for sign-in at the first vote, sends it (tapping your current vote takes it
// back), then reloads the report so counts and status are the server's.
export function useVoting(near: LngLat | null) {
  const { requireSignIn } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const vote = useCallback(
    async (r: CommunityReport, v: Vote): Promise<VoteOutcome> => {
      if (!(await requireSignIn('vote'))) return { report: null, error: 'not_signed_in' };
      setBusyId(r.id);
      try {
        await castVote(r.id, r.myVote === v ? null : v);
        return { report: await reportDetail(r.id, near) };
      } catch (error) {
        const code = error instanceof ReportError && error.code === 'not_allowed' ? 'not_allowed' : 'network';
        return { report: null, error: code };
      } finally {
        setBusyId(null);
      }
    },
    [requireSignIn, near],
  );

  return { vote, busyId };
}
