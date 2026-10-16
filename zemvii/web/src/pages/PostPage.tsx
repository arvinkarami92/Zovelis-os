// A single post with its conversation.

import { useState } from 'react';
import { ArrowLeft, CornerDownRight, EyeOff, Flag, Lock, Trash2 } from 'lucide-react';
import type { CommentView, PostView } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { back, Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { timeAgo } from '../lib/format.ts';
import { PostCard } from '../components/PostCard.tsx';
import { ReportSheet } from '../components/PostSheets.tsx';
import { RichText } from '../components/RichText.tsx';
import { LiveToneHint, ToneNudge, useToneGuard } from '../components/Tone.tsx';
import { Avatar, Confirm, Empty, ErrorNote, SkeletonPosts, UserName, useToast } from '../components/ui.tsx';

function CommentBox({ post, parent, onAdded, onCancel }: { post: PostView; parent?: CommentView; onAdded: (c: CommentView) => void; onCancel?: () => void }) {
  const { me } = useSession();
  const [text, setText] = useState(parent ? `@${parent.author.handle} ` : '');
  const guard = useToneGuard();
  if (!me) {
    return (
      <p className="muted">
        <Link to="/login">Log in</Link> to join the conversation.
      </p>
    );
  }
  if (!post.canReply) {
    return (
      <div className="info-note">
        <Lock size={16} /> {post.author.name} limited who can reply to this post.
      </div>
    );
  }
  const send = (confirmTone = false) =>
    guard.run(async () => {
      const comment = await api.post<CommentView>(`/posts/${post.id}/comments`, { text, parentId: parent?.id, confirmTone });
      setText('');
      onAdded(comment);
    });
  return (
    <div className="comment-box">
      <Avatar user={me} size={34} />
      <div className="grow stack" style={{ gap: 8 }}>
        <label htmlFor={`comment-${parent?.id ?? 'root'}`} className="sr-only">
          Write a comment
        </label>
        <textarea
          id={`comment-${parent?.id ?? 'root'}`}
          className="textarea comment-input"
          placeholder={parent ? `Reply to ${parent.author.name}…` : 'Add to the conversation…'}
          value={text}
          maxLength={1000}
          rows={2}
          onChange={(e) => setText(e.target.value)}
        />
        <LiveToneHint text={text} />
        {guard.nudge && <ToneNudge tone={guard.nudge} onEdit={guard.clear} onPostAnyway={() => void send(true)} />}
        {guard.error && <div className="field-error">{guard.error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {onCancel && (
            <button className="btn btn-ghost btn-small" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="btn btn-primary btn-small" disabled={!text.trim() || guard.busy} onClick={() => void send()}>
            {parent ? 'Reply' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Comment({ comment, post, replies, onAdded, onDeleted }: { comment: CommentView; post: PostView; replies: CommentView[]; onAdded: (c: CommentView) => void; onDeleted: (id: string) => void }) {
  const { me } = useSession();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const one = (c: CommentView, isReply: boolean) => (
    <div className={`comment${isReply ? ' comment-reply' : ''}${c.filtered ? ' comment-filtered' : ''}`} key={c.id}>
      <Avatar user={c.author} size={isReply ? 30 : 36} />
      <div className="comment-body">
        <div className="comment-head">
          <UserName user={c.author} />
          <span className="muted small">{timeAgo(c.createdAt)}</span>
          {c.filtered && (
            <span className="pill" title="Hidden from others by your hidden-words filter">
              <EyeOff size={12} /> Hidden by your filter
            </span>
          )}
        </div>
        <p className="comment-text">
          <RichText text={c.text} />
        </p>
        <div className="comment-actions">
          {!isReply && me && post.canReply && (
            <button className="link-btn" onClick={() => setReplying(true)}>
              <CornerDownRight size={14} /> Reply
            </button>
          )}
          {c.canDelete && (
            <button className="link-btn" onClick={() => setRemove(c.id)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          {me && c.author.id !== me.id && (
            <button className="link-btn" onClick={() => setReport(c.id)}>
              <Flag size={14} /> Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return (
    <div className="comment-thread">
      {one(comment, false)}
      {replies.map((r) => one(r, true))}
      {replying && (
        <div className="comment-reply">
          <CommentBox
            post={post}
            parent={comment}
            onAdded={(c) => {
              onAdded(c);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
      {report && <ReportSheet targetType="comment" targetId={report} handle={[comment, ...replies].find((c) => c.id === report)?.author.handle} onClose={() => setReport(null)} />}
      {remove && (
        <Confirm
          title="Delete this comment?"
          body="It will be removed for everyone."
          confirm="Delete"
          danger
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            try {
              await api.del(`/comments/${remove}`);
              onDeleted(remove);
              setRemove(null);
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          }}
        />
      )}
    </div>
  );
}

export function PostPage({ id }: { id: string }) {
  const post = useApi<PostView>(`/posts/${id}`);
  const comments = useApi<{ items: CommentView[]; filteredCount: number }>(`/posts/${id}/comments`);
  const add = (c: CommentView) => comments.setData((d) => (d ? { ...d, items: [...d.items, c] } : d));
  const del = (cid: string) => comments.setData((d) => (d ? { ...d, items: d.items.filter((c) => c.id !== cid && c.parentId !== cid) } : d));
  const top = comments.data?.items.filter((c) => !c.parentId) ?? [];
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back()} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Post</h1>
      </div>
      {post.loading && <SkeletonPosts count={1} />}
      {post.error && <Empty title="This post isn't available">It may have been deleted, or it's shared with a group you're not part of.</Empty>}
      {post.data && (
        <>
          <PostCard post={post.data} full onRemoved={() => back()} />
          <section className="panel comments" aria-label="Comments">
            <h2>Conversation</h2>
            <CommentBox post={post.data} onAdded={add} />
            <ErrorNote error={comments.error} />
            {top.length === 0 && comments.data && <p className="muted">No comments yet. Say something kind.</p>}
            {top.map((c) => (
              <Comment key={c.id} comment={c} post={post.data!} replies={comments.data!.items.filter((r) => r.parentId === c.id)} onAdded={add} onDeleted={del} />
            ))}
            {comments.data && comments.data.filteredCount > 0 && (
              <p className="muted small">
                <EyeOff size={14} /> {comments.data.filteredCount} comment{comments.data.filteredCount === 1 ? '' : 's'} hidden by {post.data.canEdit ? 'your' : "the author's"} hidden-words filter.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
