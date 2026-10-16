// Who is logged in, their unread counts, and platform metadata.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, isDemo, onUnauthorized } from '../api/client.ts';
import type { MeView } from '../../../server/src/services/views.ts';
import type { FeedPreset, Topic } from '../../../server/src/core/defaults.ts';
import type { ReactionType, UserSettings } from '../../../server/src/store/types.ts';
import { invalidate } from './hooks.ts';

export interface Meta {
  version: string;
  topics: Topic[];
  presets: FeedPreset[];
  reactions: Array<{ type: ReactionType; emoji: string; label: string }>;
  intents: Array<{ id: string; label: string; emoji: string; route: string }>;
  reportReasons: Array<{ id: string; label: string }>;
  artScenes: string[];
  minAge: number;
  simulated: boolean;
  money: { feeRate: number; tipPresets: number[]; minTip: number; maxTip: number; plusPrice: number };
}

export interface Counts {
  notifications: number;
  messages: number;
  followRequests: number;
  recoveryRequests: number;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

interface SessionValue {
  me: MeView | null;
  counts: Counts;
  meta: Meta | null;
  ready: boolean;
  demo: boolean;
  refresh(): Promise<void>;
  setMe(me: MeView | null): void;
  logout(): Promise<void>;
  updateSettings(patch: DeepPartial<UserSettings>): Promise<MeView>;
}

const SessionContext = createContext<SessionValue | null>(null);
const NO_COUNTS: Counts = { notifications: 0, messages: 0, followRequests: 0, recoveryRequests: 0 };

function applyAppearance(me: MeView | null) {
  const root = document.documentElement;
  const theme = me?.settings.theme ?? 'system';
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-text', me?.settings.textSize ?? 'md');
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<MeView | null>(null);
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);

  const setMe = useCallback((value: MeView | null) => {
    setMeState(value);
    applyAppearance(value);
    if (!value) setCounts(NO_COUNTS);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ me: MeView | null; counts: Counts | null }>('/session');
      setMe(result.me);
      setCounts(result.counts ?? NO_COUNTS);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setMe(null);
    }
  }, [setMe]);

  useEffect(() => {
    void (async () => {
      try {
        setMeta(await api.get<Meta>('/meta'));
      } catch {
        // shown as an error by the pages that need it
      }
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => onUnauthorized(() => setMe(null)), [setMe]);

  useEffect(() => {
    if (!me) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 20_000);
    return () => clearInterval(id);
  }, [me?.id, refresh]);

  // Tell the server the local time zone so quiet hours and digests are right.
  useEffect(() => {
    if (!me) return;
    const tz = -new Date().getTimezoneOffset();
    if (me.settings.tzOffsetMin !== tz) void api.patch<{ me: MeView }>('/me/settings', { tzOffsetMin: tz }).then((r) => setMe(r.me)).catch(() => {});
  }, [me?.id]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setMe(null);
    }
  }, [setMe]);

  const updateSettings = useCallback(
    async (patch: DeepPartial<UserSettings>) => {
      const result = await api.patch<{ me: MeView }>('/me/settings', patch);
      setMe(result.me);
      invalidate('/feed');
      return result.me;
    },
    [setMe],
  );

  const value = useMemo<SessionValue>(
    () => ({ me, counts, meta, ready, demo: isDemo(), refresh, setMe, logout, updateSettings }),
    [me, counts, meta, ready, refresh, setMe, logout, updateSettings],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

/** For pages that only render when logged in. */
export function useMe(): MeView {
  const { me } = useSession();
  if (!me) throw new Error('Not logged in');
  return me;
}
