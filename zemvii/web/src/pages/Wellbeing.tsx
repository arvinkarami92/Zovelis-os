// Wellbeing: your time, why you came, the connections you made, and the
// controls for budget, quiet hours and digests.

import { useState } from 'react';
import { Heart, MessageCircle, Moon, MessagesSquare, CalendarHeart } from 'lucide-react';
import type { WellbeingSummary } from '../../../server/src/services/wellbeing.ts';
import { errorMessage } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { useMe, useSession } from '../lib/session.tsx';
import { clock, minutes } from '../lib/format.ts';
import { Ring } from '../components/Shell.tsx';
import { ErrorNote, Spinner, Toggle, useToast } from '../components/ui.tsx';

function WeekChart({ week, budget }: { week: WellbeingSummary['week']; budget: number }) {
  const width = 560;
  const height = 200;
  const top = 22;
  const bottom = 28;
  const left = 34;
  const max = Math.max(30, budget, ...week.map((d) => d.minutes));
  const niceMax = Math.ceil(max / 30) * 30;
  const plotH = height - top - bottom;
  const y = (m: number) => top + plotH - (m / niceMax) * plotH;
  const slot = (width - left) / week.length;
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="week-chart" role="img" aria-label={`Minutes per day this week: ${week.map((d) => d.minutes).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="chart-label">
              {t}
            </text>
          </g>
        ))}
        {budget > 0 && (
          <g>
            <line x1={left} x2={width} y1={y(budget)} y2={y(budget)} stroke="var(--spark)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={width - 4} y={y(budget) - 6} textAnchor="end" className="chart-label chart-budget">
              budget {budget}
            </text>
          </g>
        )}
        {week.map((d, i) => {
          const x = left + i * slot + slot * 0.2;
          const w = slot * 0.6;
          const isToday = i === week.length - 1;
          const label = new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
          return (
            <g key={d.day}>
              <rect x={x} y={y(d.minutes)} width={w} height={Math.max(0, y(0) - y(d.minutes))} rx="6" fill={isToday ? 'var(--brand)' : 'var(--brand-soft)'} stroke="var(--brand)" strokeOpacity={isToday ? 0 : 0.35} />
              {d.minutes > 0 && (
                <text x={x + w / 2} y={y(d.minutes) - 6} textAnchor="middle" className="chart-value">
                  {d.minutes}
                </text>
              )}
              <text x={x + w / 2} y={height - 8} textAnchor="middle" className={`chart-label${isToday ? ' chart-today' : ''}`}>
                {isToday ? 'Today' : label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WellbeingPage() {
  const me = useMe();
  const { meta, updateSettings } = useSession();
  const toast = useToast();
  const summary = useApi<WellbeingSummary>('/wellbeing/summary');
  const ws = me.settings.wellbeing;
  const [quietStart, setQuietStart] = useState(ws.quietStart);
  const [quietEnd, setQuietEnd] = useState(ws.quietEnd);
  const s = summary.data;

  const save = async (patch: Partial<typeof ws>) => {
    try {
      await updateSettings({ wellbeing: patch });
      void summary.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const intents = s ? Object.entries(s.intents).sort((a, b) => b[1] - a[1]) : [];
  const intentTotal = intents.reduce((sum, [, n]) => sum + n, 0);

  return (
    <>
      <div className="page-head">
        <h1>Wellbeing</h1>
      </div>
      <p className="muted">Zemvii doesn't try to maximise your minutes. This page is here so you can decide what's enough.</p>
      {summary.loading && <Spinner />}
      <ErrorNote error={summary.error} retry={summary.reload} />
      {s && (
        <>
          <section className="today-hero panel">
            <Ring fraction={s.today.fraction} size={104} stroke={10} label={`${s.today.usedMin} minutes today`} />
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Today</span>
              <strong className="stat-num num">{minutes(s.today.usedMin)}</strong>
              <span className="muted">
                {s.today.budgetMin ? `of your ${minutes(s.today.budgetMin)} budget` : 'No daily budget set'} · {minutes(s.averageMinutes)} a day on average
              </span>
              {s.quietNow && (
                <span className="pill">
                  <Moon size={12} /> Quiet hours now
                </span>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>This week</h2>
            <WeekChart week={s.week} budget={s.today.budgetMin} />
          </section>

          <section className="panel">
            <h2>Connections this week</h2>
            <p className="muted small">The number we actually care about: time spent with people, not with a feed.</p>
            <div className="connect-grid">
              <div className="connect">
                <MessagesSquare size={20} />
                <strong className="num">{s.connections.conversations}</strong>
                <span>conversations</span>
              </div>
              <div className="connect">
                <MessageCircle size={20} />
                <strong className="num">{s.connections.comments}</strong>
                <span>comments you wrote</span>
              </div>
              <div className="connect">
                <CalendarHeart size={20} />
                <strong className="num">{s.connections.plans}</strong>
                <span>plans you joined</span>
              </div>
              <div className="connect">
                <Heart size={20} />
                <strong className="num">{s.connections.reactionsFromFriends}</strong>
                <span>reactions from people you follow</span>
              </div>
            </div>
          </section>

          {intentTotal > 0 && (
            <section className="panel">
              <h2>Why you opened Zemvii</h2>
              <div className="bars">
                {intents.map(([id, n]) => {
                  const intent = meta?.intents.find((i) => i.id === id);
                  return (
                    <div className="bar-row" key={id}>
                      <span>
                        {intent?.emoji} {intent?.label.replace('Catch up with friends', 'Friends').replace('Discover something new', 'Discover').replace('Just my messages', 'Messages') ?? id}
                      </span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.round((n / intentTotal) * 100)}%` }} />
                      </div>
                      <span className="mono">{Math.round((n / intentTotal) * 100)}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <section className="panel">
        <h2>Your settings</h2>
        <div className="field">
          <span className="field-label">Daily budget</span>
          <div className="chips" role="radiogroup" aria-label="Daily budget">
            {[30, 45, 60, 90, 120, 0].map((b) => (
              <button key={b} role="radio" aria-checked={ws.dailyBudgetMin === b} className="chip" aria-pressed={ws.dailyBudgetMin === b} onClick={() => save({ dailyBudgetMin: b })}>
                {b === 0 ? 'Off' : minutes(b)}
              </button>
            ))}
          </div>
          <span className="field-help">When you reach it, we'll check in once. It's a nudge, not a lock.</span>
        </div>
        <Toggle id="wb-quiet" label="Quiet hours" help={me.teen ? 'Always on for teen accounts.' : 'No notifications at night, except urgent account security.'} checked={ws.quietHours} disabled={me.teen} onChange={(v) => save({ quietHours: v })} />
        {ws.quietHours && (
          <div className="form-grid two">
            <label className="field">
              <span>From</span>
              <input id="wb-quiet-start" className="input" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} onBlur={() => save({ quietStart })} />
            </label>
            <label className="field">
              <span>Until</span>
              <input id="wb-quiet-end" className="input" type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} onBlur={() => save({ quietEnd })} />
            </label>
          </div>
        )}
        <Toggle
          id="wb-digest"
          label="Notification digests"
          help={`Non-urgent notifications arrive at 08:00, 13:00 and 19:00${s?.nextDigestAt ? `; next at ${clock(s.nextDigestAt)}` : ''}. Messages from friends still come right away.`}
          checked={ws.notifications === 'digest'}
          onChange={(v) => save({ notifications: v ? 'digest' : 'realtime' })}
        />
        <Toggle id="wb-intent" label='Ask "What brings you here?"' help="Once per visit, to take you straight to what you came for." checked={ws.intentPrompt} onChange={(v) => save({ intentPrompt: v })} />
        <label className="field">
          <span>Clips per set</span>
          <select id="wb-clips" className="select" value={ws.clipsSetSize} onChange={(e) => save({ clipsSetSize: Number(e.target.value) })}>
            {[5, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n} clips, then a pause
              </option>
            ))}
          </select>
        </label>
      </section>
    </>
  );
}
