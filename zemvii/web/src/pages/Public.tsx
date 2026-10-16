// Pages for people who are not logged in, plus Why Zemvii.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, CircleCheckBig, KeyRound, Sparkles, Users } from 'lucide-react';
import type { MeView } from '../../../server/src/services/views.ts';
import { api, ApiError, errorMessage } from '../api/client.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { SceneArt } from '../art/SceneArt.tsx';
import { Logo } from '../components/Shell.tsx';
import { Avatar, VerifiedBadge } from '../components/ui.tsx';
import { COMPARISON, PILLARS } from '../content.ts';

const DEMO_PASSWORD = 'zemvii-demo-2026';

export function PublicFrame({ children }: { children: ReactNode }) {
  const { demo } = useSession();
  return (
    <div className="public">
      <header className="public-bar">
        <Logo to="/" />
        <nav className="row">
          <Link to="/why" className="btn btn-ghost btn-small">
            Why Zemvii
          </Link>
          <Link to="/login" className="btn btn-ghost btn-small">
            Log in
          </Link>
          <Link to="/signup" className="btn btn-primary btn-small">
            {demo ? 'Enter the demo' : 'Sign up'}
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

function HeroPreview() {
  const maya = { name: 'Maya Okafor', hue: 165, avatarUrl: null };
  return (
    <div className="hero-preview" aria-label="A preview of the Zemvii feed">
      <div className="dial-strip hero-dials" aria-hidden="true">
        {[
          ['Discover', 30],
          ['Popular', 40],
          ['Calm', 50],
        ].map(([label, value]) => (
          <div className="mini-dial" key={label}>
            <span className="mini-dial-label">
              {label} <span className="mono">{value}</span>
            </span>
            <div className="mini-dial-track">
              <div className="mini-dial-fill" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <article className="post hero-post">
        <header className="post-head">
          <Avatar user={maya} size={40} />
          <div className="post-who">
            <span className="user-name">
              Maya Okafor <VerifiedBadge small />
            </span>
            <span className="post-meta">@maya · 2h · Close friends</span>
          </div>
        </header>
        <div className="post-context">
          <span className="why-chip">
            <Sparkles size={13} /> <span>@maya is in your Close friends circle</span>
          </span>
        </div>
        <p className="post-text">First light over the ridge. Woke up at 4:40 for eleven minutes of this. #hiking</p>
        <div className="media-grid n1">
          <div className="media-item">
            <SceneArt scene="mountains" seed={11} animated />
          </div>
        </div>
        <div className="reacted-by">❤️🤩 Leo, Priya and others</div>
      </article>
      <div className="hero-caught">
        <CircleCheckBig size={20} /> You're all caught up
      </div>
    </div>
  );
}

export function Landing() {
  const { demo } = useSession();
  return (
    <PublicFrame>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Your people. Your feed. Your rules.</span>
          <h1 className="hero-title">
            The social network that works <em>for</em> you, not on you.
          </h1>
          <p className="hero-sub">
            Zemvii puts the people you follow first, lets you tune the algorithm with dials, labels every AI post, pays creators 90%, and tells you
            when you're all caught up.
          </p>
          <div className="row">
            <Link to="/signup" className="btn btn-primary">
              {demo ? 'Step into the demo' : 'Create your account'} <ArrowRight size={18} />
            </Link>
            <Link to="/why" className="btn btn-secondary">
              What's different
            </Link>
          </div>
          {demo && <p className="muted small">The demo runs entirely in your browser, with a small world of fictional people.</p>}
        </div>
        <HeroPreview />
      </section>

      <section className="landing-section">
        <div className="landing-head">
          <span className="eyebrow">What the big platforms get wrong</span>
          <h2>Nine fixes, built in from day one</h2>
        </div>
        <div className="pillars">
          {PILLARS.map((p) => (
            <article key={p.title} className="pillar">
              <h3>{p.title}</h3>
              <p className="pillar-problem">{p.problem}</p>
              <p>{p.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-head">
          <span className="eyebrow">Side by side</span>
          <h2>How Zemvii compares</h2>
        </div>
        <ComparisonTable />
      </section>

      <section className="landing-section money-strip">
        <div className="landing-head">
          <span className="eyebrow">The business model</span>
          <h2>How Zemvii makes money without selling your attention</h2>
        </div>
        <div className="money-grid">
          <div>
            <strong className="money-figure">$4.99</strong>
            <span>Zemvii+ a month: themes, longer clips, ad-free Discover. Safety and privacy are never paywalled.</span>
          </div>
          <div>
            <strong className="money-figure">10%</strong>
            <span>of tips and supporter memberships. Creators keep the other 90%.</span>
          </div>
          <div>
            <strong className="money-figure">1 in 12</strong>
            <span>at most: contextual sponsored posts, only in Mix and Discover, never for teens, never from tracking.</span>
          </div>
        </div>
        <Link to="/signup" className="btn btn-primary">
          {demo ? 'Try it now' : 'Join Zemvii'} <ArrowRight size={18} />
        </Link>
      </section>
      <footer className="public-foot muted small">
        Zemvii {demo ? '· demo world with fictional people and brands' : ''} · <Link to="/why">Why Zemvii</Link>
      </footer>
    </PublicFrame>
  );
}

export function ComparisonTable() {
  return (
    <div className="table-wrap">
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">What you need</th>
            <th scope="col">Facebook</th>
            <th scope="col">Instagram</th>
            <th scope="col">TikTok</th>
            <th scope="col" className="compare-us">
              Zemvii
            </th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map((row) => (
            <tr key={row.need}>
              <th scope="row">{row.need}</th>
              <td>{row.facebook}</td>
              <td>{row.instagram}</td>
              <td>{row.tiktok}</td>
              <td className="compare-us">
                <Check size={15} aria-hidden="true" /> {row.zemvii}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuthCard({ title, children, foot }: { title: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <PublicFrame>
      <div className="auth">
        <div className="auth-card">
          <h1>{title}</h1>
          {children}
        </div>
        {foot && <div className="auth-foot">{foot}</div>}
      </div>
    </PublicFrame>
  );
}

function suggestHandle(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
}

export function Signup() {
  const { demo, meta, setMe } = useSession();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState(demo ? '1998-06-15' : '');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!handleTouched) setHandle(suggestHandle(name));
  }, [name, handleTouched]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ me: MeView }>('/auth/signup', {
        name,
        handle,
        email: demo ? `${handle}@demo.zemvii.invalid` : email,
        password: demo ? DEMO_PASSWORD : password,
        birthDate,
        tzOffsetMin: -new Date().getTimezoneOffset(),
      });
      setMe(result.me);
      navigate('/welcome', { replace: true });
    } catch (err) {
      setError({ message: errorMessage(err), field: err instanceof ApiError ? err.details?.field : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={demo ? 'Step into the demo' : 'Join Zemvii'} foot={<span>Already have an account? <Link to="/login">Log in</Link></span>}>
      {demo && <p className="muted">Pick a name. You'll land in a small world of fictional people with posts, plans and chats to try.</p>}
      <form className="form-grid" onSubmit={submit} noValidate>
        <label className="field">
          <span>Your name</span>
          <input id="su-name" className="input" autoComplete="name" required maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Handle</span>
          <div className="input-prefix">
            <span>@</span>
            <input
              id="su-handle"
              className="input"
              autoComplete="username"
              required
              maxLength={20}
              value={handle}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase());
              }}
            />
          </div>
          {error?.field === 'handle' && <span className="field-error">{error.message}</span>}
        </label>
        {!demo && (
          <>
            <label className="field">
              <span>Email</span>
              <input id="su-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              {error?.field === 'email' && <span className="field-error">{error.message}</span>}
            </label>
            <label className="field">
              <span>Password</span>
              <input id="su-password" className="input" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="field-help">At least 10 characters. A short sentence works well.</span>
              {error?.field === 'password' && <span className="field-error">{error.message}</span>}
            </label>
          </>
        )}
        <label className="field">
          <span>Birth date</span>
          <input id="su-birth" className="input" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <span className="field-help">
            Used only for age protections, never shown. You need to be at least {meta?.minAge ?? 13}.{demo ? ' Try a date under 18 to see teen mode.' : ''}
          </span>
          {error?.field === 'birthDate' && <span className="field-error">{error.message}</span>}
        </label>
        {error && !error.field && <div className="field-error">{error.message}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !name || !handle || !birthDate}>
          {busy ? 'Creating your account…' : demo ? 'Enter Zemvii' : 'Create account'}
        </button>
        <p className="muted small">No tracking ads. You can export or delete everything at any time.</p>
      </form>
    </AuthCard>
  );
}

export function Login() {
  const { setMe, demo } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ me: MeView }>('/auth/login', { identifier, password });
      setMe(result.me);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard
      title="Welcome back"
      foot={
        <span>
          New here? <Link to="/signup">{demo ? 'Enter the demo' : 'Create an account'}</Link>
        </span>
      }
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span>Email or handle</span>
          <input id="li-id" className="input" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input id="li-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {demo && <p className="muted small">Demo accounts use the password {DEMO_PASSWORD}</p>}
        {error && <div className="field-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          Log in
        </button>
        <Link to="/recover" className="small">
          <KeyRound size={14} /> Locked out? Get back in with your recovery friends
        </Link>
      </form>
    </AuthCard>
  );
}

interface RecoveryState {
  requestId: string;
  secret: string;
  friendsAsked: number;
}

function loadRecovery(): RecoveryState | null {
  try {
    return JSON.parse(localStorage.getItem('zv-recovery') ?? 'null');
  } catch {
    return null;
  }
}

export function Recover() {
  const { setMe } = useSession();
  const [handle, setHandle] = useState('');
  const [state, setState] = useState<RecoveryState | null>(loadRecovery);
  const [status, setStatus] = useState<{ status: string; approvals: number; needed: number } | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const check = async () => {
      try {
        setStatus(await api.post('/recovery/status', { requestId: state.requestId, secret: state.secret }));
      } catch (e) {
        setError(errorMessage(e));
      }
    };
    void check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [state]);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.post<RecoveryState>('/recovery/start', { handle });
      setState(result);
      try {
        localStorage.setItem('zv-recovery', JSON.stringify(result));
      } catch {
        // keep it in memory only
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const complete = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.post<{ me: MeView }>('/recovery/complete', { requestId: state!.requestId, secret: state!.secret, password });
      try {
        localStorage.removeItem('zv-recovery');
      } catch {
        // ignore
      }
      setMe(result.me);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthCard title="Get back in with friends" foot={<Link to="/login">Back to log in</Link>}>
      {!state ? (
        <form className="form-grid" onSubmit={start}>
          <p className="muted">
            If you set up recovery friends, two of them can vouch for you. We'll ask them in Zemvii; they should check with you directly before
            approving.
          </p>
          <label className="field">
            <span>Your handle</span>
            <input id="rc-handle" className="input" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
          {error && <div className="field-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={!handle}>
            <Users size={18} /> Ask my recovery friends
          </button>
        </form>
      ) : status?.status === 'approved' ? (
        <form className="form-grid" onSubmit={complete}>
          <p>
            <strong>Your friends vouched for you.</strong> Choose a new password. Every other device will be signed out.
          </p>
          <label className="field">
            <span>New password</span>
            <input id="rc-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="field-error">{error}</div>}
          <button className="btn btn-primary btn-block">Set password and log in</button>
        </form>
      ) : (
        <div className="stack">
          <p>
            We asked {state.friendsAsked} of your recovery friends. Call or message two of them and ask them to open their Zemvii notifications.
          </p>
          <div className="recovery-meter num">
            {status ? `${status.approvals} of ${status.needed} friends have vouched` : 'Checking…'}
          </div>
          {status?.status === 'expired' && <div className="field-error">This request expired. Start again.</div>}
          {error && <div className="field-error">{error}</div>}
          <button
            className="btn btn-ghost"
            onClick={() => {
              setState(null);
              setStatus(null);
              try {
                localStorage.removeItem('zv-recovery');
              } catch {
                // ignore
              }
            }}
          >
            Start over
          </button>
        </div>
      )}
    </AuthCard>
  );
}

export function WhyPage() {
  const { me } = useSession();
  const content = (
    <div className="stack-lg why-page">
      <header className="stack">
        <span className="eyebrow">Why Zemvii</span>
        <h1>Social media that works for you</h1>
        <p className="lead">
          In 2026 the big platforms are optimised for minutes, not for people. Feeds hide your friends, AI content floods in, creators get less, and
          a jury found Meta's design harmful. Zemvii is built the other way round.
        </p>
      </header>
      <div className="pillars pillars-list">
        {PILLARS.map((p) => (
          <article key={p.title} className="pillar">
            <h3>{p.title}</h3>
            <p className="pillar-problem">{p.problem}</p>
            <p>{p.answer}</p>
            {me && (
              <Link to={p.tryIt.to} className="small">
                {p.tryIt.label} →
              </Link>
            )}
          </article>
        ))}
      </div>
      <section className="stack">
        <h2>Side by side</h2>
        <ComparisonTable />
      </section>
      <p className="muted small">The research behind this page, with sources, is in docs/STRATEGY.md in the Zemvii repository.</p>
    </div>
  );
  return me ? content : <PublicFrame>{content}</PublicFrame>;
}
