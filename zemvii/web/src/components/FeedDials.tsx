// Feed Dials: you decide how your Mix feed is ranked.

import { useMemo, useState } from 'react';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import type { FeedDials } from '../../../server/src/store/types.ts';
import { errorMessage } from '../api/client.ts';
import { useSession } from '../lib/session.tsx';
import { Sheet, Toggle, useToast } from './ui.tsx';

export function describeDials(d: Pick<FeedDials, 'friendsVsDiscover' | 'freshVsPopular' | 'calm' | 'ai'>): string {
  const people =
    d.friendsVsDiscover === 0
      ? 'Only people you follow and spaces you joined'
      : d.friendsVsDiscover < 30
        ? 'Mostly people you follow, with a little discovery'
        : d.friendsVsDiscover < 60
          ? 'A mix of your people and new voices'
          : 'Mostly new voices in topics you love';
  const order = d.freshVsPopular < 30 ? 'newest first' : d.freshVsPopular < 70 ? 'balancing new and well-loved' : 'well-loved posts rise';
  const calm = d.calm < 20 ? 'heated posts ranked normally' : d.calm < 70 ? 'heated posts turned down' : 'arguments sink to the bottom';
  return `${people}, ${order}, ${calm}${d.ai === 'hide' ? ', no AI-generated posts' : ''}.`;
}

function Dial({ id, name, value, onChange, left, right }: { id: string; name: string; value: number; onChange: (v: number) => void; left: string; right: string }) {
  return (
    <div className="dial">
      <div className="dial-top">
        <label className="dial-name" htmlFor={id}>
          {name}
        </label>
        <span className="dial-readout">{String(value).padStart(3, ' ')} / 100</span>
      </div>
      <input
        id={id}
        className="dial-range"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        style={{ ['--fill' as string]: `${value}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value} of 100, ${left} to ${right}`}
      />
      <div className="dial-ends" aria-hidden="true">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function TopicPicker({ label, selected, onChange, muted }: { label: string; selected: string[]; onChange: (v: string[]) => void; muted?: boolean }) {
  const { meta } = useSession();
  const topics = meta?.topics ?? [];
  const extra = selected.filter((t) => !topics.some((x) => x.id === t));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="eyebrow">{label}</span>
      <div className="chips">
        {[...topics.map((t) => ({ id: t.id, text: `${t.emoji} ${t.label}` })), ...extra.map((t) => ({ id: t, text: `#${t}` }))].map((t) => {
          const on = selected.includes(t.id);
          return (
            <button key={t.id} className={`chip${muted ? ' is-muted' : ''}`} aria-pressed={on} onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}>
              {t.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DialsEditor({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const { me, meta, updateSettings } = useSession();
  const toast = useToast();
  const [dials, setDials] = useState<FeedDials>(() => structuredClone(me!.settings.feed));
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FeedDials>) => setDials((d) => ({ ...d, ...patch, preset: patch.preset ?? 'custom' }));
  const summary = useMemo(() => describeDials(dials), [dials]);

  const save = async () => {
    setBusy(true);
    try {
      await updateSettings({ feed: dials });
      toast('Feed Dials saved. Your Mix is re-ranked.');
      onSaved?.();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addWord = () => {
    const w = word.trim().toLowerCase();
    if (w && !dials.mutedWords.includes(w)) set({ mutedWords: [...dials.mutedWords, w] });
    setWord('');
  };

  return (
    <div className="stack-lg">
      <section className="stack">
        <span className="eyebrow">Start from a preset</span>
        <div className="presets">
          {(meta?.presets ?? []).map((p) => (
            <button key={p.id} className="preset" aria-pressed={dials.preset === p.id} onClick={() => setDials((d) => ({ ...d, ...p.dials, preset: p.id }))}>
              <strong>{p.label}</strong>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack-lg dials-panel">
        <Dial id="dial-people" name="Who you see" value={dials.friendsVsDiscover} onChange={(v) => set({ friendsVsDiscover: v })} left="My people" right="Discover" />
        <Dial id="dial-fresh" name="What rises" value={dials.freshVsPopular} onChange={(v) => set({ freshVsPopular: v })} left="Newest" right="Well-loved" />
        <Dial id="dial-calm" name="Calm" value={dials.calm} onChange={(v) => set({ calm: v })} left="Off" right="Very calm" />
        <div className="dial-summary" aria-live="polite">
          <strong>Your Mix:</strong> {summary}
        </div>
      </section>

      <Toggle
        id="dial-ai"
        label="Show AI-generated posts"
        help="Every post says whether it's human-made, AI-assisted or AI-generated. Turn this off to hide AI-generated ones everywhere."
        checked={dials.ai === 'show'}
        onChange={(v) => set({ ai: v ? 'show' : 'hide' })}
      />

      <TopicPicker label="Boost topics (ranked higher)" selected={dials.boostTopics} onChange={(boostTopics) => set({ boostTopics })} />
      <TopicPicker label="Mute topics (never shown in Mix)" selected={dials.muteTopics} onChange={(muteTopics) => set({ muteTopics })} muted />

      <section className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Muted words</span>
        <div className="input-row">
          <input
            id="dial-word"
            className="input"
            placeholder="e.g. spoiler"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addWord();
              }
            }}
          />
          <button className="btn btn-secondary" onClick={addWord} aria-label="Add muted word">
            <Plus size={18} />
          </button>
        </div>
        {dials.mutedWords.length > 0 && (
          <div className="chips">
            {dials.mutedWords.map((w) => (
              <button key={w} className="chip is-muted" aria-pressed="true" onClick={() => set({ mutedWords: dials.mutedWords.filter((x) => x !== w) })}>
                {w} <X size={13} />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          Save dials
        </button>
      </div>
    </div>
  );
}

export function DialsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Feed Dials" onClose={onClose} wide>
      <DialsEditor onSaved={onClose} onCancel={onClose} />
    </Sheet>
  );
}

export function DialStrip({ dials, onOpen }: { dials: FeedDials; onOpen: () => void }) {
  const meters = [
    ['Discover', dials.friendsVsDiscover],
    ['Popular', dials.freshVsPopular],
    ['Calm', dials.calm],
  ] as const;
  return (
    <div className="dial-strip">
      {meters.map(([label, value]) => (
        <div className="mini-dial" key={label} title={`${label}: ${value} of 100`}>
          <span className="mini-dial-label">
            {label} <span className="mono">{value}</span>
          </span>
          <div className="mini-dial-track">
            <div className="mini-dial-fill" style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
      <button className="btn btn-soft btn-small" onClick={onOpen} aria-label="Tune Feed Dials">
        <SlidersHorizontal size={16} /> <span className="hide-narrow">Tune</span>
      </button>
    </div>
  );
}
