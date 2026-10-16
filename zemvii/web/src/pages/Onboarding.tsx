// First run: interests, feed, wellbeing, people. Four short steps.

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { MeView, UserSummary } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { navigate } from '../lib/router.tsx';
import { useMe, useSession } from '../lib/session.tsx';
import { Toggle, UserRow, useToast } from '../components/ui.tsx';

const BUDGETS = [30, 60, 90, 120, 0];

export function Onboarding() {
  const me = useMe();
  const { meta, setMe, updateSettings } = useSession();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [topics, setTopics] = useState<string[]>(me.topics);
  const [preset, setPreset] = useState(me.settings.feed.preset);
  const [hideAi, setHideAi] = useState(me.settings.feed.ai === 'hide');
  const [budget, setBudget] = useState(me.settings.wellbeing.dailyBudgetMin);
  const [digest, setDigest] = useState(me.settings.wellbeing.notifications === 'digest');
  const [intent, setIntent] = useState(me.settings.wellbeing.intentPrompt);
  const people = useApi<{ items: Array<{ user: UserSummary; reason: string }> }>(step === 3 ? '/users/suggested' : null);
  const following = useApi<{ items: UserSummary[] }>(step === 3 ? `/users/${me.handle}/following` : null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const next = async () => {
    setBusy(true);
    try {
      if (step === 0) setMe((await api.patch<{ me: MeView }>('/me', { topics })).me);
      if (step === 1) await updateSettings({ feed: { preset, ai: hideAi ? 'hide' : 'show' } });
      if (step === 2) await updateSettings({ wellbeing: { dailyBudgetMin: budget, notifications: digest ? 'digest' : 'realtime', intentPrompt: intent } });
      if (step === 3) {
        navigate('/home?feed=friends', { replace: true });
        return;
      }
      setStep(step + 1);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const follow = async (handle: string) => {
    try {
      await api.post(`/users/${handle}/follow`);
      setFollowed((s) => new Set(s).add(handle));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const steps = ['Interests', 'Your feed', 'Your time', 'Your people'];

  return (
    <div className="onboarding">
      <ol className="steps" aria-label="Setup steps">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-dot">{i < step ? <Check size={13} /> : i + 1}</span>
            <span className="step-label">{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="stack-lg">
          <header className="stack">
            <h1>What are you into, {me.name.split(' ')[0]}?</h1>
            <p className="muted">Pick a few. They shape suggestions in your Mix feed; you can change them any time.</p>
          </header>
          <div className="chips topic-chips">
            {(meta?.topics ?? []).map((t) => (
              <button key={t.id} className="chip" aria-pressed={topics.includes(t.id)} onClick={() => setTopics((list) => (list.includes(t.id) ? list.filter((x) => x !== t.id) : [...list, t.id]))}>
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="stack-lg">
          <header className="stack">
            <h1>How should your Mix feed work?</h1>
            <p className="muted">Your Friends feed is always every post from people you follow, newest first. The Mix feed is yours to tune.</p>
          </header>
          <div className="presets">
            {(meta?.presets ?? []).map((p) => (
              <button key={p.id} className="preset" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
                <strong>{p.label}</strong>
                <span>{p.description}</span>
              </button>
            ))}
          </div>
          <Toggle id="ob-ai" label="Hide AI-generated posts" help="Every post is labelled human-made, AI-assisted or AI-generated." checked={hideAi} onChange={setHideAi} />
        </section>
      )}

      {step === 2 && (
        <section className="stack-lg">
          <header className="stack">
            <h1>How much Zemvii is enough?</h1>
            <p className="muted">Set a daily budget. When you reach it, we'll check in once. It's your call, not a lock.</p>
          </header>
          <div className="chips" role="radiogroup" aria-label="Daily budget">
            {BUDGETS.map((b) => (
              <button key={b} role="radio" aria-checked={budget === b} className="chip" aria-pressed={budget === b} onClick={() => setBudget(b)}>
                {b === 0 ? 'No budget' : `${b} min a day`}
              </button>
            ))}
          </div>
          <Toggle id="ob-digest" label="Bundle notifications into 3 digests a day" help="8:00, 13:00 and 19:00. Messages from friends still arrive right away." checked={digest} onChange={setDigest} />
          <Toggle id="ob-intent" label='Ask "What brings you here?" when I open Zemvii' help="Takes you straight to what you came for." checked={intent} onChange={setIntent} />
          {me.teen && <div className="info-note">Your account is private and quiet hours are on, because you're under 18.</div>}
        </section>
      )}

      {step === 3 && (
        <section className="stack-lg">
          <header className="stack">
            <h1>Your people</h1>
            <p className="muted">Zemvii is better with people you know. Here's who you already follow, and a few suggestions.</p>
          </header>
          {(following.data?.items.length ?? 0) > 0 && (
            <div className="panel">
              <span className="eyebrow">You follow</span>
              <div className="avatar-cloud">
                {following.data!.items.slice(0, 12).map((u) => (
                  <span key={u.id} className="pill">
                    {u.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel">
            <span className="eyebrow">Suggestions</span>
            {(people.data?.items ?? []).slice(0, 8).map(({ user, reason }) => (
              <UserRow
                key={user.id}
                user={user}
                sub={reason}
                action={
                  <button className={`btn btn-small ${followed.has(user.handle) ? 'btn-secondary' : 'btn-primary'}`} disabled={followed.has(user.handle)} onClick={() => follow(user.handle)}>
                    {followed.has(user.handle) ? 'Following' : 'Follow'}
                  </button>
                }
              />
            ))}
            {people.data && people.data.items.length === 0 && <p className="muted">No suggestions yet. Find people in Discover.</p>}
          </div>
        </section>
      )}

      <div className="row-between onboarding-foot">
        {step > 0 ? (
          <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" disabled={busy || (step === 0 && topics.length === 0)} onClick={next}>
          {step === 3 ? 'Go to my feed' : 'Continue'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
