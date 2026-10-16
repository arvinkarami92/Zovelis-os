// Sheets opened from a post: why, tip, report, edit, note.

import { useState } from 'react';
import { Clock, Compass, Flag, Heart, Leaf, ShieldCheck, SlidersHorizontal, Sparkles, Star, TrendingUp, Users, Waves } from 'lucide-react';
import type { PostView, WhyView } from '../../../server/src/services/views.ts';
import type { Origin, ReplyControl } from '../../../server/src/store/types.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi } from '../lib/hooks.ts';
import { navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { formatMoney } from '../lib/format.ts';
import { ErrorNote, ORIGIN_LABELS, Sheet, Spinner, Toggle, useToast } from './ui.tsx';
import { ToneNudge, useToneGuard } from './Tone.tsx';

const REASON_ICONS: Record<string, typeof Heart> = {
  self: Leaf, circle: Heart, friend: Heart, follow: Users, space: Users, interest: Compass, discover: Compass,
  boost: TrendingUp, fresh: Clock, popular: Star, calm: Waves, origin: Sparkles,
};

export function WhySheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { data, error } = useApi<WhyView>(`/posts/${postId}/why`);
  const rows = data?.breakdown
    ? [
        ['Your people', data.breakdown.people],
        ['Your interests', data.breakdown.interests],
        ['Freshness', data.breakdown.freshness],
        ['Appreciation', data.breakdown.appreciation],
      ] as const
    : [];
  return (
    <Sheet
      title="Why am I seeing this?"
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            onClose();
            navigate('/dials');
          }}
        >
          <SlidersHorizontal size={18} /> Tune my Feed Dials
        </button>
      }
    >
      <ErrorNote error={error} />
      {!data && !error && <Spinner />}
      {data && (
        <>
          {data.excludedBecause && (
            <div className="info-note">
              <ShieldCheck size={18} />
              <span>
                <strong>Your Mix feed would skip this post.</strong> {data.excludedBecause}
              </span>
            </div>
          )}
          <ul className="why-reasons">
            {data.reasons.map((reason, i) => {
              const Icon = REASON_ICONS[reason.kind] ?? Sparkles;
              return (
                <li key={i}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{reason.text}</span>
                </li>
              );
            })}
          </ul>
          {data.breakdown && (
            <section className="stack">
              <span className="eyebrow">What made up the score</span>
              <div className="bars">
                {rows.map(([label, share]) => (
                  <div className="bar-row" key={label}>
                    <span>{label}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                    <span className="mono">{Math.round(share * 100)}%</span>
                  </div>
                ))}
              </div>
              <div className="chips">
                <span className="pill">Topic boost ×{data.breakdown.boost.toFixed(2)}</span>
                <span className={`pill${data.breakdown.calm < 1 ? ' pill-brand' : ''}`}>Calm dial ×{data.breakdown.calm.toFixed(2)}</span>
              </div>
            </section>
          )}
          <section className="stack">
            <span className="eyebrow">Your dials right now</span>
            <div className="chips">
              <span className="pill mono">Friends↔Discover {data.dials.friendsVsDiscover}</span>
              <span className="pill mono">Fresh↔Popular {data.dials.freshVsPopular}</span>
              <span className="pill mono">Calm {data.dials.calm}</span>
              <span className="pill">AI posts: {data.dials.ai === 'hide' ? 'hidden' : 'shown'}</span>
            </div>
          </section>
          <p className="muted small">{data.feedNote}</p>
        </>
      )}
    </Sheet>
  );
}

export function TipSheet({ post, onClose }: { post: PostView; onClose: () => void }) {
  const { meta } = useSession();
  const toast = useToast();
  const wallet = useApi<{ balanceCents: number }>('/wallet');
  const presets = meta?.money.tipPresets ?? [100, 300, 500, 1000];
  const [amount, setAmount] = useState(presets[2] ?? 500);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = Math.round(amount * (meta?.money.feeRate ?? 0.1));
  const enough = (wallet.data?.balanceCents ?? 0) >= amount;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/posts/${post.id}/tip`, { amountCents: amount, note });
      toast(`Sent ${formatMoney(amount)} to ${post.author.name.split(' ')[0]} 💛`);
      invalidate('/wallet', '/me');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={`Tip ${post.author.name}`}
      onClose={onClose}
      footer={
        enough ? (
          <button className="btn btn-primary" disabled={busy} onClick={send}>
            Send {formatMoney(amount)}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate('/wallet');
            }}
          >
            Add test credits
          </button>
        )
      }
    >
      <div className="chips" role="group" aria-label="Amount">
        {presets.map((cents) => (
          <button key={cents} className="chip" aria-pressed={amount === cents} onClick={() => setAmount(cents)}>
            {formatMoney(cents)}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Add a note (optional)</span>
        <input id="tip-note" className="input" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thanks for this!" />
      </label>
      <div className="dial-summary num">
        <strong>{post.author.name.split(' ')[0]} receives {formatMoney(amount - fee)}</strong>. Zemvii keeps {formatMoney(fee)} (10%). No other fees.
      </div>
      <p className="muted small">
        Wallet balance: {wallet.data ? formatMoney(wallet.data.balanceCents) : '…'} in test credits. No real money moves in this version.
      </p>
      {error && <div className="field-error">{error}</div>}
    </Sheet>
  );
}

export function ReportSheet({ targetType, targetId, handle, onClose }: { targetType: 'post' | 'comment' | 'user' | 'message' | 'space' | 'plan'; targetId: string; handle?: string; onClose: () => void }) {
  const { meta } = useSession();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await api.post('/reports', { targetType, targetId, reason, details });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const act = async (what: 'block' | 'mute') => {
    if (!handle) return;
    await api.post(`/users/${handle}/${what}`);
    toast(what === 'block' ? `Blocked @${handle}` : `Muted @${handle}`);
    invalidate('/feed', '/users');
    onClose();
  };
  return (
    <Sheet
      title={done ? 'Thanks for telling us' : 'Report'}
      onClose={onClose}
      footer={
        done ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <button className="btn btn-danger" disabled={!reason} onClick={submit}>
            <Flag size={16} /> Send report
          </button>
        )
      }
    >
      {done ? (
        <div className="stack">
          <p>A person will review this. We'll tell you what we decided, and why.</p>
          {handle && (
            <div className="row">
              <button className="btn btn-secondary" onClick={() => act('mute')}>
                Mute @{handle}
              </button>
              <button className="btn btn-danger-soft" onClick={() => act('block')}>
                Block @{handle}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="muted">What's wrong? Reports are private: the person won't know who reported them.</p>
          <div className="chips" role="radiogroup" aria-label="Reason">
            {(meta?.reportReasons ?? []).map((r) => (
              <button key={r.id} role="radio" aria-checked={reason === r.id} className="chip" aria-pressed={reason === r.id} onClick={() => setReason(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Anything else we should know? (optional)</span>
            <textarea id="report-details" className="textarea" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          {error && <div className="field-error">{error}</div>}
        </>
      )}
    </Sheet>
  );
}

export function EditPostSheet({ post, onClose, onSaved }: { post: PostView; onClose: () => void; onSaved: (p: PostView) => void }) {
  const [text, setText] = useState(post.text);
  const [origin, setOrigin] = useState<Origin>(post.origin);
  const [reply, setReply] = useState<ReplyControl>(post.replyControl);
  const [showCounts, setShowCounts] = useState(post.showCounts);
  const guard = useToneGuard();
  const save = (confirmTone = false) =>
    guard.run(async () => {
      const updated = await api.patch<PostView>(`/posts/${post.id}`, { text, origin, replyControl: reply, showCounts, confirmTone });
      onSaved(updated);
      onClose();
    });
  return (
    <Sheet
      title="Edit post"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" disabled={guard.busy} onClick={() => save()}>
          Save
        </button>
      }
    >
      <textarea id="edit-text" className="textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={2200} />
      <label className="field">
        <span>How was this made?</span>
        <select id="edit-origin" className="select" value={origin} onChange={(e) => setOrigin(e.target.value as Origin)}>
          {(Object.keys(ORIGIN_LABELS) as Origin[]).map((o) => (
            <option key={o} value={o}>
              {ORIGIN_LABELS[o].label}: {ORIGIN_LABELS[o].help}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Who can reply</span>
        <select id="edit-reply" className="select" value={reply} onChange={(e) => setReply(e.target.value as ReplyControl)}>
          <option value="everyone">Anyone who can see it</option>
          <option value="followers">People who follow you</option>
          <option value="friends">Friends (you follow each other)</option>
          <option value="nobody">Nobody</option>
        </select>
      </label>
      <Toggle id="edit-counts" label="Show reaction counts to everyone" help="Off: only you see the numbers." checked={showCounts} onChange={setShowCounts} />
      {guard.error && <div className="field-error">{guard.error}</div>}
      {guard.nudge && <ToneNudge tone={guard.nudge} onEdit={guard.clear} onPostAnyway={() => save(true)} />}
    </Sheet>
  );
}

export function NoteSheet({ post, onClose, onSaved }: { post: PostView; onClose: () => void; onSaved: (p: PostView) => void }) {
  const { me } = useSession();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      onSaved(await api.post<PostView>(`/posts/${post.id}/notes`, { text }));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Sheet
      title="Add context"
      onClose={onClose}
      footer={
        me?.verifiedHuman ? (
          <button className="btn btn-primary" disabled={text.trim().length < 10} onClick={submit}>
            Propose note
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              navigate('/settings/account');
            }}
          >
            Verify you're human
          </button>
        )
      }
    >
      <p className="muted">
        Community notes add facts and sources that help people understand a post. A note is shown once enough readers rate it helpful.
      </p>
      {me?.verifiedHuman ? (
        <textarea id="note-text" className="textarea" maxLength={500} placeholder="What context would help people? Link a source if you can." value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <div className="info-note">
          <ShieldCheck size={18} />
          <span>Only verified humans can write notes. It keeps notes from being gamed by bots.</span>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}
    </Sheet>
  );
}
