// "Pause & rethink": the tone check in the interface. The same classifier the
// server enforces runs here as you type, so the hint is instant.

import { useCallback, useMemo, useState } from 'react';
import { HeartHandshake, PauseCircle, ShieldAlert } from 'lucide-react';
import { checkTone, SUPPORT_MESSAGE, type ToneResult } from '../../../server/src/core/tone.ts';
import { ApiError, errorMessage } from '../api/client.ts';
import { useDebounced } from '../lib/hooks.ts';

export function useToneGuard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<ToneResult | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNudge(null);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'tone_nudge' || e.code === 'tone_threat') && e.details?.tone) setNudge(e.details.tone as ToneResult);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, nudge, run, clear: () => setNudge(null) };
}

export function ToneNudge({ tone, onEdit, onPostAnyway }: { tone: ToneResult; onEdit: () => void; onPostAnyway: () => void }) {
  const threat = tone.level === 'threat';
  return (
    <div className={`tone-nudge${threat ? ' is-threat' : ''}`} role="alertdialog" aria-label="Pause and rethink">
      <div className="tone-nudge-head">
        {threat ? <ShieldAlert size={22} /> : <PauseCircle size={22} />}
        <h3>{threat ? "This can't be posted" : 'Pause & rethink'}</h3>
      </div>
      <p>{tone.suggestion}</p>
      {tone.reasons.length > 0 && (
        <ul className="tone-reasons">
          {tone.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <button className="btn btn-primary btn-small" onClick={onEdit}>
          Edit my words
        </button>
        {!threat && (
          <button className="btn btn-ghost btn-small" onClick={onPostAnyway}>
            Post anyway
          </button>
        )}
      </div>
    </div>
  );
}

/** A quiet hint under a text box, updated as you type. */
export function LiveToneHint({ text }: { text: string }) {
  const debounced = useDebounced(text, 350);
  const tone = useMemo(() => (debounced.trim().length > 3 ? checkTone(debounced) : null), [debounced]);
  if (!tone || tone.level === 'ok') return null;
  if (tone.level === 'self_harm') {
    return (
      <div className="support-card" role="note">
        <HeartHandshake size={20} />
        <p>{SUPPORT_MESSAGE}</p>
      </div>
    );
  }
  const text2 =
    tone.level === 'threat'
      ? "Threats can't be posted on Zemvii."
      : tone.level === 'hurtful'
        ? 'This might land as hurtful.'
        : 'Strong words. People with the Calm dial up will see this lower.';
  return (
    <div className={`tone-hint tone-${tone.level}`} role="status">
      <PauseCircle size={15} aria-hidden="true" /> {text2}
    </div>
  );
}

export { errorMessage };
