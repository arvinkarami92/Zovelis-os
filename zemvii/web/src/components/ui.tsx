// Shared building blocks: toasts, sheets, avatars, badges, toggles, sliders.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, Bot, Globe, Heart, Leaf, Lock, Sparkles, Star, Users, X } from 'lucide-react';
import type { UserSummary } from '../../../server/src/services/views.ts';
import type { Audience, Origin } from '../../../server/src/store/types.ts';
import { Link } from '../lib/router.tsx';

// ---- Toasts ------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---- Sheet (bottom sheet on phones, dialog on larger screens) -----------------

export function Sheet({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    document.body.classList.add('sheet-open');
    return () => {
      removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A confirmation step built into the page (browser confirm() is unavailable in some frames). */
export function Confirm({ title, body, confirm, danger, onConfirm, onClose }: { title: string; body: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </button>
        </>
      }
    >
      <div className="prose">{body}</div>
    </Sheet>
  );
}

// ---- People --------------------------------------------------------------------

export function Avatar({ user, size = 40 }: { user: Pick<UserSummary, 'name' | 'hue' | 'avatarUrl'>; size?: number }) {
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    ['--h' as string]: String(user.hue),
  };
  if (user.avatarUrl) return <img className="avatar" src={user.avatarUrl} alt="" style={style} />;
  return (
    <span className="avatar avatar-initials" style={style} aria-hidden="true">
      {initials || '·'}
    </span>
  );
}

export function VerifiedBadge({ small }: { small?: boolean }) {
  return (
    <span className="verified" title="Verified human">
      <BadgeCheck size={small ? 14 : 16} aria-hidden="true" />
      <span className="sr-only">Verified human</span>
    </span>
  );
}

export function UserName({ user, link = true }: { user: UserSummary; link?: boolean }) {
  const content = (
    <>
      <span className="name">{user.name}</span>
      {user.verifiedHuman && <VerifiedBadge small />}
    </>
  );
  return link ? (
    <Link to={`/u/${user.handle}`} className="user-name">
      {content}
    </Link>
  ) : (
    <span className="user-name">{content}</span>
  );
}

export function UserRow({ user, sub, action }: { user: UserSummary; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="user-row">
      <Link to={`/u/${user.handle}`} className="user-row-main">
        <Avatar user={user} size={44} />
        <div className="user-row-text">
          <span className="user-row-name">
            {user.name} {user.verifiedHuman && <VerifiedBadge small />}
          </span>
          <span className="muted">{sub ?? `@${user.handle}`}</span>
        </div>
      </Link>
      {action}
    </div>
  );
}

// ---- Labels --------------------------------------------------------------------

export const ORIGIN_LABELS: Record<Origin, { label: string; short: string; help: string }> = {
  human: { label: 'Human-made', short: 'Human', help: 'Made by a person without generative AI.' },
  ai_assisted: { label: 'AI-assisted', short: 'AI-assisted', help: 'A person made it with help from AI tools.' },
  ai_generated: { label: 'AI-generated', short: 'AI', help: 'Mostly or entirely generated by AI.' },
};

export function OriginBadge({ origin, quiet }: { origin: Origin; quiet?: boolean }) {
  if (origin === 'human' && quiet) return null;
  const Icon = origin === 'human' ? Leaf : origin === 'ai_assisted' ? Sparkles : Bot;
  return (
    <span className={`origin origin-${origin}`} title={ORIGIN_LABELS[origin].help}>
      <Icon size={13} aria-hidden="true" />
      {ORIGIN_LABELS[origin].label}
    </span>
  );
}

export const AUDIENCE_LABELS: Record<Audience, string> = {
  public: 'Public',
  followers: 'Followers',
  friends: 'Friends',
  circle: 'Circle',
  supporters: 'Supporters',
  space: 'Space',
  private: 'Only me',
};

export function AudienceIcon({ audience, size = 13 }: { audience: Audience; size?: number }) {
  const Icon = audience === 'public' ? Globe : audience === 'followers' || audience === 'space' ? Users : audience === 'friends' ? Heart : audience === 'supporters' ? Star : audience === 'private' ? Lock : Heart;
  return <Icon size={size} aria-hidden="true" />;
}

// ---- Controls --------------------------------------------------------------------

export function Toggle({ id, label, help, checked, onChange, disabled }: { id: string; label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle-row${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {help && <span className="toggle-help">{help}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function SkeletonPosts({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="post skeleton-post">
          <div className="sk sk-avatar" />
          <div className="sk-lines">
            <div className="sk sk-line w40" />
            <div className="sk sk-line w90" />
            <div className="sk sk-line w70" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ error, retry }: { error: { message: string } | null; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      <span>{error.message}</span>
      {retry && (
        <button className="btn btn-small btn-ghost" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function SupportersStar() {
  return <Star size={13} aria-hidden="true" />;
}
