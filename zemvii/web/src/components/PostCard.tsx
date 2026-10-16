// A post in a feed or on its own page.

import { memo, useEffect, useRef, useState } from 'react';
import {
  Ban, Bookmark, BookmarkCheck, Coins, Copy, Flag, HelpCircle, Leaf, MessageCircle, MoreHorizontal, NotebookPen, Pencil, Play,
  ShieldAlert, SmilePlus, Sparkles, Trash2, VolumeX,
} from 'lucide-react';
import type { PostView } from '../../../server/src/services/views.ts';
import type { ReactionType } from '../../../server/src/store/types.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate } from '../lib/hooks.ts';
import { Link, navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { compact, longAgo, timeAgo } from '../lib/format.ts';
import { SceneArt } from '../art/SceneArt.tsx';
import { RichText } from './RichText.tsx';
import { AUDIENCE_LABELS, AudienceIcon, Avatar, Confirm, OriginBadge, Sheet, UserName, useToast } from './ui.tsx';
import { EditPostSheet, NoteSheet, ReportSheet, TipSheet, WhySheet } from './PostSheets.tsx';

export const REACTION_EMOJI: Record<ReactionType, string> = { love: '❤️', haha: '😄', wow: '🤩', support: '🤗', insight: '💡' };

function Media({ post, animated }: { post: PostView; animated?: boolean }) {
  const items = post.media.slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div className={`media-grid n${items.length}`}>
      {items.map((m) => (
        <div className="media-item" key={m.id}>
          {m.type === 'art' && m.art && <SceneArt scene={m.art.scene} seed={m.art.seed} animated={animated} label={m.alt || undefined} />}
          {m.type === 'image' && m.url && <img src={m.url} alt={m.alt ?? ''} loading="lazy" />}
          {m.type === 'video' && m.url && <video src={m.url} controls playsInline preload="metadata" muted={!animated} />}
          {post.kind === 'clip' && (
            <span className="media-clip-badge">
              <Play size={12} fill="currentColor" /> Clip
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function NoteBox({ post, onChange }: { post: PostView; onChange: (p: PostView) => void }) {
  const note = post.note;
  const [busy, setBusy] = useState(false);
  if (!note) return null;
  const rate = async (helpful: boolean) => {
    setBusy(true);
    try {
      onChange(await api.post<PostView>(`/notes/${note.id}/rate`, { helpful }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="note-box">
      <h4>
        <NotebookPen size={15} /> {note.shown ? 'Readers added context' : 'Proposed context'}
      </h4>
      <p>{note.text}</p>
      {note.mine ? (
        <span className="muted small">
          Your note · {note.helpful} found it helpful{note.shown ? ' · shown to everyone' : ' · shown once enough readers agree'}
        </span>
      ) : note.myRating === null && !post.canEdit ? (
        <div className="row">
          <span className="small muted">Is this helpful?</span>
          <button className="btn btn-small btn-secondary" disabled={busy} onClick={() => rate(true)}>
            Yes
          </button>
          <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => rate(false)}>
            No
          </button>
        </div>
      ) : (
        <span className="muted small num">
          {note.helpful} of {note.helpful + note.notHelpful} raters found this helpful
          {note.myRating !== null ? ` · you said ${note.myRating ? 'yes' : 'no'}` : ''}
        </span>
      )}
    </div>
  );
}

type SheetName = 'menu' | 'why' | 'tip' | 'report' | 'edit' | 'delete' | 'note' | null;

export const PostCard = memo(function PostCard({ post: initial, onRemoved, full }: { post: PostView; onRemoved?: (id: string) => void; full?: boolean }) {
  const { me, meta } = useSession();
  const toast = useToast();
  const [post, setPost] = useState(initial);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [picker, setPicker] = useState(false);
  const pressTimer = useRef<number | undefined>(undefined);
  useEffect(() => setPost(initial), [initial]);

  const react = async (type: ReactionType | null) => {
    setPicker(false);
    if (!me) return navigate('/login');
    const previous = post;
    setPost({ ...post, myReaction: type });
    try {
      setPost(type ? await api.post<PostView>(`/posts/${post.id}/react`, { type }) : await api.del<PostView>(`/posts/${post.id}/react`));
    } catch (e) {
      setPost(previous);
      toast(errorMessage(e), 'error');
    }
  };

  const toggleSave = async () => {
    if (!me) return navigate('/login');
    const saved = !post.saved;
    setPost({ ...post, saved });
    try {
      if (saved) await api.post(`/posts/${post.id}/save`);
      else await api.del(`/posts/${post.id}/save`);
      toast(saved ? 'Saved' : 'Removed from saved');
      invalidate('/me/saved');
    } catch (e) {
      setPost({ ...post, saved: !saved });
      toast(errorMessage(e), 'error');
    }
  };

  const muteOrBlock = async (what: 'mute' | 'block') => {
    setSheet(null);
    try {
      await api.post(`/users/${post.author.handle}/${what}`);
      toast(what === 'mute' ? `Muted @${post.author.handle}. They won't know.` : `Blocked @${post.author.handle}`);
      onRemoved?.(post.id);
      invalidate('/feed');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const copyLink = async () => {
    setSheet(null);
    const link = `${location.href.split('#')[0]}#/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied');
    } catch {
      toast(link, 'info');
    }
  };

  const remove = async () => {
    await api.del(`/posts/${post.id}`);
    setSheet(null);
    toast('Post deleted');
    onRemoved?.(post.id);
    invalidate('/feed', '/users');
  };

  const firstReason = post.why?.[0];
  const reactionTotal = post.reactionTotal;
  const audienceLabel = post.space ? `${post.space.emoji} ${post.space.name}` : post.circle ? `${post.circle.emoji} ${post.circle.name}` : AUDIENCE_LABELS[post.audience];

  return (
    <article className={`post${post.sponsored ? ' post-sponsored' : ''}${post.status === 'removed' ? ' post-removed' : ''}`} aria-label={`Post by ${post.author.name}`}>
      {post.status === 'removed' && (
        <div className="row small">
          <ShieldAlert size={16} /> <strong>Removed by moderators.</strong> Only you can see it. <Link to="/status">See why or appeal</Link>
        </div>
      )}
      <header className="post-head">
        <Link to={`/u/${post.author.handle}`} aria-label={post.author.name}>
          <Avatar user={post.author} size={42} />
        </Link>
        <div className="post-who">
          <UserName user={post.author} />
          <div className="post-meta">
            {post.sponsored ? (
              <span className="pill pill-spark">Sponsored</span>
            ) : (
              <span>@{post.author.handle}</span>
            )}
            <span className="sep" />
            <Link to={`/p/${post.id}`} title={new Date(post.createdAt).toLocaleString()}>
              {timeAgo(post.createdAt)}
            </Link>
            {post.editedAt && <span title={`Edited ${longAgo(post.editedAt)}`}>· edited</span>}
            <span className="sep" />
            <span className="audience-mark" title={`Shared with: ${audienceLabel}`}>
              <AudienceIcon audience={post.audience} />
              {post.space || post.circle ? <span>{audienceLabel}</span> : null}
            </span>
            {post.origin === 'human' && !post.sponsored && (
              <span title="Human-made" className="human-mark">
                <Leaf size={12} aria-label="Human-made" />
              </span>
            )}
          </div>
        </div>
        <button className="icon-btn" aria-label="Post options" onClick={() => setSheet('menu')}>
          <MoreHorizontal size={20} />
        </button>
      </header>

      {(firstReason || post.origin !== 'human') && (
        <div className="post-context">
          {post.origin !== 'human' && <OriginBadge origin={post.origin} />}
          {firstReason && me && (
            <button className="why-chip" onClick={() => setSheet('why')} title="Why am I seeing this?">
              <Sparkles size={13} aria-hidden="true" />
              <span>{firstReason.text}</span>
            </button>
          )}
        </div>
      )}

      {post.text && (
        <div className="post-text">
          <RichText text={full || post.text.length < 420 ? post.text : `${post.text.slice(0, 400)}…`} />
          {!full && post.text.length >= 420 && (
            <>
              {' '}
              <Link to={`/p/${post.id}`}>Read more</Link>
            </>
          )}
        </div>
      )}
      {post.kind === 'clip' && !full ? (
        <Link to={`/clips?start=${post.id}`} aria-label="Watch clip">
          <Media post={post} />
        </Link>
      ) : (
        <Media post={post} animated={full} />
      )}
      {post.plan && (
        <Link to={`/plans/${post.plan.id}`} className="pill pill-brand">
          A memory from: {post.plan.title}
        </Link>
      )}
      <NoteBox post={post} onChange={setPost} />

      {(post.reactedBy.length > 0 || reactionTotal) && (
        <div className="reacted-by">
          {post.reactions && (
            <span aria-hidden="true">
              {(Object.keys(post.reactions) as ReactionType[]).slice(0, 3).map((t) => REACTION_EMOJI[t]).join('')}
            </span>
          )}
          <span>
            {post.reactedBy.length > 0 && (
              <>
                {post.reactedBy.map((u) => u.name.split(' ')[0]).join(', ')}
                {reactionTotal !== null ? (reactionTotal > post.reactedBy.length ? ` and ${compact(reactionTotal - post.reactedBy.length)} more` : '') : ' and others'}
              </>
            )}
            {post.reactedBy.length === 0 && reactionTotal ? `${compact(reactionTotal)} reaction${reactionTotal === 1 ? '' : 's'}` : ''}
          </span>
          {post.canEdit && !post.showCounts && <span className="pill">Only you see counts</span>}
        </div>
      )}

      <footer className="post-foot">
        <div className="react-wrap" onMouseLeave={() => setPicker(false)}>
          {picker && (
            <div className="reaction-picker" role="menu" aria-label="Pick a reaction">
              {(meta?.reactions ?? []).map((r) => (
                <button key={r.type} role="menuitem" aria-pressed={post.myReaction === r.type} title={r.label} onClick={() => react(post.myReaction === r.type ? null : r.type)}>
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
          <button
            className={`act${post.myReaction ? ' is-on' : ''}`}
            aria-label={post.myReaction ? `Your reaction: ${post.myReaction}. Change or remove` : 'React'}
            onClick={() => (post.myReaction ? react(null) : react('love'))}
            onContextMenu={(e) => {
              e.preventDefault();
              setPicker(true);
            }}
            onPointerDown={() => {
              pressTimer.current = window.setTimeout(() => setPicker(true), 420);
            }}
            onPointerUp={() => clearTimeout(pressTimer.current)}
            onPointerLeave={() => clearTimeout(pressTimer.current)}
          >
            <span aria-hidden="true">{post.myReaction ? REACTION_EMOJI[post.myReaction] : '♡'}</span>
            {post.myReaction ? 'Reacted' : 'React'}
          </button>
        </div>
        <button className="act" aria-label="Choose a reaction" onClick={() => setPicker((v) => !v)}>
          <SmilePlus size={18} />
        </button>
        <Link className="act" to={`/p/${post.id}`} aria-label={`${post.commentCount} comments`}>
          <MessageCircle size={18} /> {post.commentCount > 0 ? compact(post.commentCount) : ''}
        </Link>
        {post.canTip && (
          <button className="act" onClick={() => setSheet('tip')} aria-label="Send a tip">
            <Coins size={18} /> Tip
          </button>
        )}
        {post.tipCents ? <span className="pill pill-brand num">${(post.tipCents / 100).toFixed(2)} in tips</span> : null}
        <span className="act-spacer" />
        <button className={`act${post.saved ? ' is-saved' : ''}`} aria-label={post.saved ? 'Unsave' : 'Save'} onClick={toggleSave}>
          {post.saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        </button>
      </footer>

      {sheet === 'menu' && (
        <Sheet title="Post options" onClose={() => setSheet(null)}>
          <div className="list panel panel-flush">
            {me && (
              <button className="list-item" onClick={() => setSheet('why')}>
                <HelpCircle size={18} /> Why am I seeing this?
              </button>
            )}
            <button className="list-item" onClick={copyLink}>
              <Copy size={18} /> Copy link
            </button>
            {post.canEdit ? (
              <>
                <button className="list-item" onClick={() => setSheet('edit')}>
                  <Pencil size={18} /> Edit post
                </button>
                <button className="list-item" onClick={() => setSheet('delete')}>
                  <Trash2 size={18} /> Delete post
                </button>
              </>
            ) : (
              me && (
                <>
                  {!post.note && !post.sponsored && (
                    <button className="list-item" onClick={() => setSheet('note')}>
                      <NotebookPen size={18} /> Add context (community note)
                    </button>
                  )}
                  <button className="list-item" onClick={() => muteOrBlock('mute')}>
                    <VolumeX size={18} /> Mute @{post.author.handle}
                  </button>
                  <button className="list-item" onClick={() => muteOrBlock('block')}>
                    <Ban size={18} /> Block @{post.author.handle}
                  </button>
                  <button className="list-item" onClick={() => setSheet('report')}>
                    <Flag size={18} /> Report post
                  </button>
                </>
              )
            )}
          </div>
        </Sheet>
      )}
      {sheet === 'why' && <WhySheet postId={post.id} onClose={() => setSheet(null)} />}
      {sheet === 'tip' && <TipSheet post={post} onClose={() => setSheet(null)} />}
      {sheet === 'report' && <ReportSheet targetType="post" targetId={post.id} handle={post.author.handle} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <EditPostSheet post={post} onClose={() => setSheet(null)} onSaved={setPost} />}
      {sheet === 'note' && <NoteSheet post={post} onClose={() => setSheet(null)} onSaved={setPost} />}
      {sheet === 'delete' && (
        <Confirm title="Delete this post?" body="It will be removed for everyone. This can't be undone." confirm="Delete" danger onConfirm={remove} onClose={() => setSheet(null)} />
      )}
    </article>
  );
});
