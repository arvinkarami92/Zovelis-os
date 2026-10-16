// Settings, Account Status, the moderation queue, and the phone menu.

import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, BadgeCheck, Bell, ChevronRight, Database, KeyRound, Palette, ShieldAlert, ShieldCheck, SlidersHorizontal, Sprout, Star, User,
  UserCog, Eye,
} from 'lucide-react';
import type { MeView, ModerationView, ReportView, UserSummary } from '../../../server/src/services/views.ts';
import type { Audience, ReplyControl } from '../../../server/src/store/types.ts';
import { api, errorMessage, getTransport } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { back, Link, navigate } from '../lib/router.tsx';
import { useMe, useSession } from '../lib/session.tsx';
import { longAgo } from '../lib/format.ts';
import { prepareUpload } from '../lib/image.ts';
import { MenuLinks } from '../components/Shell.tsx';
import { Avatar, Confirm, Empty, ErrorNote, Segmented, Sheet, Spinner, Toggle, UserRow, useToast } from '../components/ui.tsx';

const SECTIONS = [
  { id: 'profile', label: 'Profile', help: 'Name, photo, bio, interests', icon: User },
  { id: 'account', label: 'Account and security', help: 'Password, verified human, recovery friends', icon: KeyRound },
  { id: 'privacy', label: 'Privacy and safety', help: 'Who can see, message and comment; hidden words', icon: ShieldCheck },
  { id: 'feed', label: 'Feed Dials', help: 'How your Mix feed is ranked', icon: SlidersHorizontal },
  { id: 'wellbeing', label: 'Wellbeing', help: 'Daily budget, quiet hours, digests', icon: Sprout },
  { id: 'notifications', label: 'Notifications', help: 'Digests or right away', icon: Bell },
  { id: 'appearance', label: 'Appearance', help: 'Theme and text size', icon: Palette },
  { id: 'creator', label: 'Creator and wallet', help: 'Tips, supporters, Zemvii+', icon: Star },
  { id: 'data', label: 'Your data', help: 'Export everything, delete your account', icon: Database },
];

function Back({ to = '/settings' }: { to?: string }) {
  return (
    <button className="icon-btn back-btn" onClick={() => back(to)} aria-label="Back">
      <ArrowLeft size={22} />
    </button>
  );
}

function ProfileSettings() {
  const me = useMe();
  const { meta, setMe } = useSession();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio);
  const [pronouns, setPronouns] = useState(me.pronouns);
  const [location, setLocation] = useState(me.location);
  const [website, setWebsite] = useState(me.website);
  const [hue, setHue] = useState(me.hue);
  const [topics, setTopics] = useState(me.topics);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.patch<{ me: MeView }>('/me', { name, bio, pronouns, location, website, hue, topics });
      setMe(result.me);
      toast('Profile saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      const media = await api.upload(await prepareUpload(file, 600));
      const result = await api.patch<{ me: MeView }>('/me', { avatarUrl: media.url, avatarId: media.id });
      setMe(result.me);
      toast('Photo updated');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  return (
    <form className="form-grid" onSubmit={save}>
      <div className="row">
        <Avatar user={{ ...me, hue }} size={72} />
        <label className="btn btn-secondary btn-small" htmlFor="avatar-file">
          Change photo
        </label>
        <input id="avatar-file" type="file" accept="image/*" hidden onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
        {me.avatarUrl && (
          <button type="button" className="btn btn-ghost btn-small" onClick={async () => setMe((await api.patch<{ me: MeView }>('/me', { avatarUrl: null })).me)}>
            Remove
          </button>
        )}
      </div>
      <label className="field">
        <span>Colour</span>
        <input id="pf-hue" type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="hue-range" />
      </label>
      <label className="field">
        <span>Name</span>
        <input id="pf-name" className="input" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="form-grid two">
        <label className="field">
          <span>Pronouns</span>
          <input id="pf-pronouns" className="input" maxLength={30} value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="she/her, they/them…" />
        </label>
        <label className="field">
          <span>Location</span>
          <input id="pf-location" className="input" maxLength={60} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Bio</span>
        <textarea id="pf-bio" className="textarea" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      <label className="field">
        <span>Website</span>
        <input id="pf-website" className="input" maxLength={200} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
      </label>
      <div className="field">
        <span className="field-label">Interests</span>
        <div className="chips">
          {(meta?.topics ?? []).map((t) => (
            <button type="button" key={t.id} className="chip" aria-pressed={topics.includes(t.id)} onClick={() => setTopics((l) => (l.includes(t.id) ? l.filter((x) => x !== t.id) : [...l, t.id]))}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="field-error">{error}</div>}
      <button className="btn btn-primary">Save profile</button>
    </form>
  );
}

function AccountSettings() {
  const me = useMe();
  const { setMe, meta } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [verifying, setVerifying] = useState(false);
  const recovery = useApi<{ chosen: UserSummary[]; eligible: UserSummary[] }>('/me/recovery-friends');
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked(recovery.data?.chosen.map((u) => u.id) ?? []), [recovery.data]);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/me/password', { current, next });
      setCurrent('');
      setNext('');
      toast('Password changed. Other devices were signed out.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const saveRecovery = async () => {
    try {
      await api.put('/me/recovery-friends', { userIds: picked });
      toast('Recovery friends saved');
      void recovery.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const verify = async () => {
    try {
      setMe((await api.post<{ me: MeView }>('/me/verify-human')).me);
      setVerifying(false);
      toast("You're a verified human");
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="stack-lg">
      <section className="panel">
        <h2>
          <BadgeCheck size={18} /> Verified human
        </h2>
        {me.verifiedHuman ? (
          <p>You're verified. A small check appears next to your name, and you can write community notes.</p>
        ) : (
          <>
            <p className="muted">
              Verification proves there's a real person behind an account, without Zemvii keeping your ID. Verified people can write community notes.
            </p>
            <button className="btn btn-primary" onClick={() => setVerifying(true)}>
              Verify you're human
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <h2>
          <KeyRound size={18} /> Recovery friends
        </h2>
        <p className="muted">
          Choose up to three friends. If you're ever locked out, two of them can vouch for you and you'll set a new password. Only friends (you follow
          each other) can be chosen.
        </p>
        {!recovery.data && <Spinner />}
        {recovery.data?.eligible.length === 0 && <p className="muted">Follow some friends back first.</p>}
        <div className="chips">
          {recovery.data?.eligible.map((u) => (
            <button key={u.id} className="chip" aria-pressed={picked.includes(u.id)} onClick={() => setPicked((l) => (l.includes(u.id) ? l.filter((x) => x !== u.id) : l.length < 3 ? [...l, u.id] : l))}>
              <Avatar user={u} size={20} /> {u.name}
            </button>
          ))}
        </div>
        <div className="row-between">
          <span className="muted small num">{picked.length} of 3 chosen</span>
          <button className="btn btn-primary btn-small" onClick={saveRecovery}>
            Save
          </button>
        </div>
      </section>

      <form className="panel form-grid" onSubmit={changePassword}>
        <h2>Password</h2>
        <p className="muted small">Signed in as {me.email}</p>
        <label className="field">
          <span>Current password</span>
          <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="field">
          <span>New password</span>
          <input id="pw-next" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          <span className="field-help">At least 10 characters.</span>
        </label>
        <button className="btn btn-secondary" disabled={!current || next.length < 10}>
          Change password
        </button>
      </form>

      {verifying && (
        <Sheet title="Verify you're human" onClose={() => setVerifying(false)} footer={<button className="btn btn-primary" onClick={verify}>Start check</button>}>
          <ol className="steps-list">
            <li>A short liveness check with your camera (a few seconds of turning your head).</li>
            <li>The provider confirms a real, unique person. No ID document is needed.</li>
            <li>Zemvii stores only "verified: yes". Never your face or your ID.</li>
          </ol>
          {meta?.simulated && <div className="info-note demo-note">In this demo the check is simulated: tapping Start check verifies you straight away.</div>}
        </Sheet>
      )}
    </div>
  );
}

function PrivacySettings() {
  const me = useMe();
  const { updateSettings } = useSession();
  const toast = useToast();
  const p = me.settings.privacy;
  const [words, setWords] = useState(p.hiddenWords.join(', '));
  const save = async (patch: Partial<typeof p>) => {
    try {
      const updated = await updateSettings({ privacy: patch });
      if (patch.privateAccount === false && updated.settings.privacy.privateAccount) toast('Accounts under 16 stay private.', 'info');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  return (
    <div className="stack-lg">
      <section className="panel">
        <Toggle id="pv-private" label="Private account" help="Only people you approve see your posts. Always on for under-16s." checked={p.privateAccount} onChange={(v) => save({ privateAccount: v })} />
        <Toggle id="pv-counts" label="Show follower counts" help="Off: your follower and following lists are private." checked={p.showFollowerCounts} onChange={(v) => save({ showFollowerCounts: v })} />
        <Toggle id="pv-reactions" label="Show reaction counts on new posts" help="Off by default: only you see how many people reacted." checked={p.showCountsByDefault} onChange={(v) => save({ showCountsByDefault: v })} />
      </section>
      <section className="panel form-grid">
        <label className="field">
          <span>New posts go to</span>
          <select id="pv-audience" className="select" value={p.defaultAudience} onChange={(e) => save({ defaultAudience: e.target.value as Audience })}>
            {!me.teen && <option value="public">Public</option>}
            <option value="followers">Followers</option>
            <option value="friends">Friends</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <label className="field">
          <span>Who can message you</span>
          <select id="pv-message" className="select" value={p.whoCanMessage} onChange={(e) => save({ whoCanMessage: e.target.value as typeof p.whoCanMessage })}>
            {!me.teen && <option value="everyone">Everyone (others land in Requests)</option>}
            <option value="followers">People you follow and your followers</option>
            <option value="friends">Friends only</option>
          </select>
        </label>
        <label className="field">
          <span>Who can comment on new posts</span>
          <select id="pv-comment" className="select" value={p.whoCanComment} onChange={(e) => save({ whoCanComment: e.target.value as ReplyControl })}>
            <option value="everyone">Anyone who can see the post</option>
            <option value="followers">People who follow you</option>
            <option value="friends">Friends</option>
            <option value="nobody">Nobody</option>
          </select>
        </label>
        <label className="field">
          <span>Hidden words</span>
          <input id="pv-words" className="input" value={words} onChange={(e) => setWords(e.target.value)} onBlur={() => save({ hiddenWords: words.split(',').map((w) => w.trim()).filter(Boolean) })} placeholder="Comma-separated words" />
          <span className="field-help">Comments on your posts that contain these words are hidden from everyone except the person who wrote them.</span>
        </label>
      </section>
      <Link to="/status" className="panel row" style={{ textDecoration: 'none' }}>
        <ShieldAlert size={20} /> <span className="grow">Account Status: moderation decisions and appeals</span> <ChevronRight size={18} />
      </Link>
    </div>
  );
}

function NotificationSettings() {
  const me = useMe();
  const { updateSettings } = useSession();
  const ws = me.settings.wellbeing;
  return (
    <section className="panel">
      <Toggle
        id="nt-digest"
        label="Digests"
        help="Non-urgent notifications arrive together at 08:00, 13:00 and 19:00. Friends' messages, plan changes and account security come right away."
        checked={ws.notifications === 'digest'}
        onChange={(v) => void updateSettings({ wellbeing: { notifications: v ? 'digest' : 'realtime' } })}
      />
      <Toggle id="nt-quiet" label="Quiet hours" help={`${ws.quietStart}–${ws.quietEnd}. Change the times in Wellbeing.`} checked={ws.quietHours} disabled={me.teen} onChange={(v) => void updateSettings({ wellbeing: { quietHours: v } })} />
      <p className="muted small">Zemvii never sends "you might have missed" reminders, streak warnings or other notifications designed to pull you back.</p>
    </section>
  );
}

function AppearanceSettings() {
  const me = useMe();
  const { updateSettings } = useSession();
  return (
    <section className="panel form-grid">
      <div className="field">
        <span className="field-label">Theme</span>
        <Segmented label="Theme" value={me.settings.theme} onChange={(theme) => void updateSettings({ theme })} options={[{ value: 'system', label: 'Device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </div>
      <div className="field">
        <span className="field-label">Text size</span>
        <Segmented label="Text size" value={me.settings.textSize} onChange={(textSize) => void updateSettings({ textSize })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} />
      </div>
    </section>
  );
}

function DataSettings() {
  const { demo, setMe } = useSession();
  const toast = useToast();
  const [exported, setExported] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const exportData = async () => {
    try {
      setExported(JSON.stringify(await api.get('/me/export'), null, 2));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported ?? '');
      toast('Copied');
    } catch {
      toast('Select the text and copy it', 'info');
    }
  };
  return (
    <div className="stack-lg">
      <section className="panel">
        <h2>
          <Eye size={18} /> What we store, and what we don't
        </h2>
        <ul className="plain-list">
          <li>Your account, posts, comments, reactions, messages, follows, circles, plans and settings.</li>
          <li>Your daily minutes, so you can see them on the Wellbeing page.</li>
          <li>Your birth date, only to apply age protections. It's never shown.</li>
          <li>
            <strong>Never:</strong> tracking pixels, third-party ad SDKs, your activity on other apps, or your location.
          </li>
        </ul>
      </section>
      <section className="panel">
        <h2>Export everything</h2>
        <p className="muted">One file with everything Zemvii stores about you, in a format other services can read.</p>
        {demo ? (
          <button className="btn btn-secondary" onClick={exportData}>
            Show my data
          </button>
        ) : (
          <a className="btn btn-secondary" href="/api/me/export" download>
            Download my data (JSON)
          </a>
        )}
      </section>
      <section className="panel">
        <h2>Delete account</h2>
        <p className="muted">Your posts, comments, messages and profile are erased right away. This can't be undone.</p>
        <button className="btn btn-danger-soft" onClick={() => setDeleting(true)}>
          Delete my account
        </button>
      </section>
      {demo && (
        <section className="panel">
          <h2>Demo world</h2>
          <p className="muted">Everything in this demo lives in your browser. Start over with a fresh world and a new account.</p>
          <button className="btn btn-secondary" onClick={() => setResetting(true)}>
            Reset the demo
          </button>
        </section>
      )}
      {exported && (
        <Sheet title="Your data" onClose={() => setExported(null)} wide footer={<button className="btn btn-primary" onClick={copy}>Copy JSON</button>}>
          <pre className="export-view">{exported}</pre>
        </Sheet>
      )}
      {deleting && (
        <Confirm
          title="Delete your account?"
          body={
            <div className="stack">
              <p>Everything you've shared will be erased. Type your password to confirm.</p>
              {demo && <p className="muted small">Demo accounts use the password zemvii-demo-2026</p>}
              <input id="delete-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
            </div>
          }
          confirm="Delete forever"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api.post('/me/delete', { password });
              setMe(null);
              navigate('/', { replace: true });
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        />
      )}
      {resetting && (
        <Confirm title="Reset the demo?" body="Your demo account and everything in the demo world will be replaced with a fresh start." confirm="Reset" onClose={() => setResetting(false)} onConfirm={() => getTransport().reset?.()} />
      )}
    </div>
  );
}

export function SettingsPage({ section }: { section: string | null }) {
  useEffect(() => {
    if (section === 'feed') navigate('/dials', { replace: true });
    if (section === 'wellbeing') navigate('/wellbeing', { replace: true });
    if (section === 'creator') navigate('/creator', { replace: true });
  }, [section]);
  const current = SECTIONS.find((s) => s.id === section);
  if (!section || !current) {
    return (
      <>
        <div className="page-head">
          <h1>Settings</h1>
        </div>
        <div className="panel panel-flush list">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`/settings/${s.id}`} className="list-item">
              <s.icon size={20} />
              <span className="grow stack" style={{ gap: 0 }}>
                <strong>{s.label}</strong>
                <span className="muted small">{s.help}</span>
              </span>
              <ChevronRight size={18} className="muted" />
            </Link>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="page-head">
        <Back />
        <h1>{current.label}</h1>
      </div>
      {section === 'profile' && <ProfileSettings />}
      {section === 'account' && <AccountSettings />}
      {section === 'privacy' && <PrivacySettings />}
      {section === 'notifications' && <NotificationSettings />}
      {section === 'appearance' && <AppearanceSettings />}
      {section === 'data' && <DataSettings />}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = { remove: 'Content removed', warn: 'Warning', suspend: 'Account suspended', label_ai: 'Labelled AI-generated' };

export function AccountStatus() {
  const { meta } = useSession();
  const toast = useToast();
  const status = useApi<{ standing: 'good' | 'warned' | 'suspended'; suspendedUntil: number | null; actions: ModerationView[] }>('/me/status');
  const [appealing, setAppealing] = useState<ModerationView | null>(null);
  const [text, setText] = useState('');
  const reason = (id: string) => meta?.reportReasons.find((r) => r.id === id)?.label ?? id;
  const s = status.data;
  return (
    <>
      <div className="page-head">
        <Back to="/settings/privacy" />
        <h1>Account Status</h1>
      </div>
      {status.loading && <Spinner />}
      <ErrorNote error={status.error} />
      {s && (
        <>
          <div className={`standing standing-${s.standing}`}>
            {s.standing === 'good' ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />}
            <div>
              <strong>
                {s.standing === 'good' ? 'Your account is in good standing' : s.standing === 'warned' ? 'Recent decisions on your account' : 'Your account is suspended'}
              </strong>
              <p className="small">
                {s.standing === 'suspended' && s.suspendedUntil
                  ? `You can read and appeal, but not post, until ${new Date(s.suspendedUntil).toLocaleString()}.`
                  : 'Every decision below comes with a reason, and you can appeal each one. A different moderator reviews appeals.'}
              </p>
            </div>
          </div>
          {s.actions.length === 0 && <Empty icon={<ShieldCheck size={26} />} title="No decisions on your account">Nothing has ever been removed or restricted.</Empty>}
          {s.actions.map((a) => (
            <article key={a.id} className="panel">
              <div className="row-between">
                <strong>{ACTION_LABEL[a.action] ?? a.action}</strong>
                <span className="muted small">{longAgo(a.createdAt)}</span>
              </div>
              <span className="pill">Rule: {reason(a.reason)}</span>
              {a.preview && <blockquote className="quote">{a.preview}</blockquote>}
              <p>
                <strong>Why:</strong> {a.explanation}
              </p>
              {a.appealStatus === 'none' && (
                <button className="btn btn-secondary btn-small" onClick={() => setAppealing(a)}>
                  Appeal this decision
                </button>
              )}
              {a.appealStatus === 'pending' && <span className="pill pill-spark">Appeal under review</span>}
              {a.appealStatus === 'upheld' && <span className="pill">Appeal reviewed: decision kept</span>}
              {a.appealStatus === 'overturned' && <span className="pill pill-brand">Appeal accepted: decision reversed</span>}
            </article>
          ))}
        </>
      )}
      {appealing && (
        <Sheet
          title="Appeal"
          onClose={() => setAppealing(null)}
          footer={
            <button
              className="btn btn-primary"
              disabled={text.trim().length < 5}
              onClick={async () => {
                try {
                  await api.post(`/me/appeals/${appealing.id}`, { text });
                  setAppealing(null);
                  setText('');
                  toast('Appeal sent. A different moderator will review it.');
                  void status.reload();
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              }}
            >
              Send appeal
            </button>
          }
        >
          <p className="muted">Tell us why you think this decision was wrong. Context helps: a link, a timelapse, what you meant.</p>
          <textarea id="appeal-text" className="textarea" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </Sheet>
      )}
    </>
  );
}

export function Moderation() {
  const { meta } = useSession();
  const toast = useToast();
  const queue = useApi<{ reports: ReportView[]; appeals: ModerationView[] }>('/admin/queue');
  const [acting, setActing] = useState<{ report: ReportView; action: string } | null>(null);
  const [explanation, setExplanation] = useState('');
  const [days, setDays] = useState(7);
  const reason = (id: string) => meta?.reportReasons.find((r) => r.id === id)?.label ?? id;

  const resolve = async (report: ReportView, action: string, why = '') => {
    try {
      await api.post('/admin/resolve', { targetType: report.targetType, targetId: report.targetId, action, explanation: why, days });
      toast(action === 'dismiss' ? 'Dismissed. Reporters were told.' : 'Done. The person and the reporters were told why.');
      setActing(null);
      setExplanation('');
      void queue.reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>
          <UserCog size={24} /> Moderation
        </h1>
      </div>
      <div className="info-note demo-note">
        <ShieldCheck size={18} />
        <span>
          Every action needs a plain-language explanation, which the person sees on their Account Status page. Appeals go to a different moderator.
          {meta?.simulated ? ' In the demo you have moderator tools so you can see how this works.' : ''}
        </span>
      </div>
      {queue.loading && <Spinner />}
      <ErrorNote error={queue.error} />
      <section className="section">
        <h2>Reports ({queue.data?.reports.length ?? 0})</h2>
        {queue.data?.reports.length === 0 && <p className="muted">The queue is empty.</p>}
        <div className="mod-grid">
          {queue.data?.reports.map((r) => (
            <article key={`${r.targetType}-${r.targetId}`} className="panel">
              <div className="row-between">
                <span className="pill">{r.targetType}</span>
                <span className="pill pill-spark num">
                  {r.reports} report{r.reports === 1 ? '' : 's'}
                </span>
              </div>
              {r.targetUser && <UserRow user={r.targetUser} />}
              <blockquote className="quote">{r.preview}</blockquote>
              <div className="chips">
                {r.reasons.map((x) => (
                  <span key={x} className="pill pill-danger">
                    {reason(x)}
                  </span>
                ))}
              </div>
              {r.details.map((d) => (
                <p key={d} className="small muted">
                  “{d}”
                </p>
              ))}
              <div className="row">
                <button className="btn btn-ghost btn-small" onClick={() => resolve(r, 'dismiss')}>
                  No violation
                </button>
                {r.targetType !== 'user' && r.targetType !== 'space' && (
                  <button className="btn btn-danger-soft btn-small" onClick={() => setActing({ report: r, action: 'remove' })}>
                    Remove
                  </button>
                )}
                {r.targetType === 'post' && (
                  <button className="btn btn-secondary btn-small" onClick={() => setActing({ report: r, action: 'label_ai' })}>
                    Label AI
                  </button>
                )}
                <button className="btn btn-secondary btn-small" onClick={() => setActing({ report: r, action: 'warn' })}>
                  Warn
                </button>
                <button className="btn btn-danger btn-small" onClick={() => setActing({ report: r, action: 'suspend' })}>
                  Suspend
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>Appeals ({queue.data?.appeals.length ?? 0})</h2>
        {queue.data?.appeals.length === 0 && <p className="muted">No appeals waiting.</p>}
        {queue.data?.appeals.map((a) => (
          <article key={a.id} className="panel">
            <strong>{ACTION_LABEL[a.action]}</strong>
            <p className="small">
              <strong>Original reason:</strong> {a.explanation}
            </p>
            <blockquote className="quote">{a.appealText}</blockquote>
            <div className="row">
              <button
                className="btn btn-primary btn-small"
                onClick={async () => {
                  try {
                    await api.post(`/admin/appeals/${a.id}`, { overturn: true });
                    void queue.reload();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              >
                Reverse decision
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={async () => {
                  try {
                    await api.post(`/admin/appeals/${a.id}`, { overturn: false });
                    void queue.reload();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }}
              >
                Keep decision
              </button>
            </div>
          </article>
        ))}
      </section>
      {acting && (
        <Sheet
          title={ACTION_LABEL[acting.action]}
          onClose={() => setActing(null)}
          footer={
            <button className={`btn ${acting.action === 'suspend' ? 'btn-danger' : 'btn-primary'}`} disabled={explanation.trim().length < 10} onClick={() => resolve(acting.report, acting.action, explanation)}>
              Confirm
            </button>
          }
        >
          <label className="field">
            <span>Explain the decision to the person</span>
            <textarea id="mod-explanation" className="textarea" maxLength={1000} value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Which rule, what in the post broke it, and what they can do differently." />
            <span className="field-help">They'll see this on their Account Status page, with a button to appeal.</span>
          </label>
          {acting.action === 'suspend' && (
            <label className="field">
              <span>For how long</span>
              <select id="mod-days" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Sheet>
      )}
    </>
  );
}

export function MenuPage() {
  return (
    <>
      <div className="page-head">
        <h1>Menu</h1>
      </div>
      <MenuLinks />
    </>
  );
}
