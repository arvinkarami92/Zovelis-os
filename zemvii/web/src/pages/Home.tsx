// Home: the Friends feed (complete, newest first) and the Mix feed (ranked
// by your dials). Both end. "Show more" is a choice, not a trap.

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarPlus, Check, Clapperboard, Compass, MessageCircle } from 'lucide-react';
import type { FeedPage, PostView } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../lib/hooks.ts';
import { back, Link, navigate, useRoute } from '../lib/router.tsx';
import { useMe } from '../lib/session.tsx';
import { PostCard } from '../components/PostCard.tsx';
import { Composer } from '../components/Composer.tsx';
import { DialsEditor, DialsSheet, DialStrip } from '../components/FeedDials.tsx';
import { Empty, ErrorNote, Segmented, SkeletonPosts, useToast } from '../components/ui.tsx';

export function CaughtUp({ variant, count }: { variant: 'friends' | 'mix'; count: number }) {
  return (
    <section className="caught-up" aria-label="You're all caught up">
      <div className="caught-up-mark">
        <Check size={34} strokeWidth={3} />
      </div>
      <h2>You're all caught up</h2>
      <p>
        {variant === 'friends'
          ? `That's every post from the people you follow in the last two weeks${count ? ` (${count} posts)` : ''}.`
          : `That's today's Mix: ${count} posts picked by your dials. There's no bottomless feed here.`}
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/plans/new" className="btn btn-secondary btn-small">
          <CalendarPlus size={16} /> Make a plan
        </Link>
        <Link to="/messages" className="btn btn-secondary btn-small">
          <MessageCircle size={16} /> Message a friend
        </Link>
        {variant === 'friends' ? (
          <Link to="/home?feed=mix" className="btn btn-ghost btn-small">
            <Compass size={16} /> Open Mix
          </Link>
        ) : (
          <Link to="/discover" className="btn btn-ghost btn-small">
            <Compass size={16} /> Discover
          </Link>
        )}
      </div>
    </section>
  );
}

function useFeed(path: string, nextParam: 'before' | 'page') {
  const first = useApi<FeedPage>(path);
  const [extra, setExtra] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    setExtra([]);
    setCursor(first.data?.nextCursor ?? null);
    setEnd(first.data?.end ?? false);
  }, [first.data]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.get<FeedPage>(`${path}${path.includes('?') ? '&' : '?'}${nextParam}=${cursor}`);
      setExtra((list) => [...list, ...page.items.filter((p) => !list.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
      setEnd(page.end);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const items = [...(first.data?.items ?? []), ...extra].filter((p) => !removed.has(p.id));
  return { first, items, cursor, end: end || (!cursor && Boolean(first.data)), loadingMore, more, remove: (id: string) => setRemoved((s) => new Set(s).add(id)) };
}

function FriendsFeed() {
  const feed = useFeed('/feed/friends', 'before');
  const marked = useRef(false);
  const seenAt = feed.first.data?.seenAt ?? 0;
  const newCount = feed.first.data?.newCount ?? 0;
  useEffect(() => {
    const newest = feed.first.data?.items[0]?.createdAt;
    if (newest && !marked.current) {
      marked.current = true;
      void api.post('/feed/friends/seen', { until: newest }).catch(() => {});
    }
  }, [feed.first.data]);

  if (feed.first.loading) return <SkeletonPosts />;
  if (feed.first.error) return <ErrorNote error={feed.first.error} retry={feed.first.reload} />;
  if (feed.items.length === 0) {
    return (
      <Empty title="Your Friends feed is quiet" action={<Link to="/discover" className="btn btn-primary">Find people to follow</Link>}>
        Follow people you know and their posts will appear here, all of them, newest first.
      </Empty>
    );
  }
  const dividerIndex = seenAt > 0 && newCount > 0 ? feed.items.findIndex((p) => p.createdAt <= seenAt) : -1;
  return (
    <div className="feed">
      {newCount > 0 && (
        <div className="new-banner">
          <strong>{newCount} new</strong> since your last visit
        </div>
      )}
      {feed.items.map((post, i) => (
        <div key={post.id} className="feed-slot">
          {i === dividerIndex && <div className="new-divider">You've seen everything below</div>}
          <PostCard post={post} onRemoved={feed.remove} />
        </div>
      ))}
      {feed.end ? (
        <CaughtUp variant="friends" count={feed.items.length} />
      ) : (
        <button className="btn btn-secondary" disabled={feed.loadingMore} onClick={feed.more}>
          {feed.loadingMore ? 'Loading…' : 'Show older posts'}
        </button>
      )}
    </div>
  );
}

function MixFeed() {
  const me = useMe();
  const feed = useFeed('/feed/mix', 'page');
  const [dials, setDials] = useState(false);
  const total = (feed.first.data as (FeedPage & { total?: number }) | undefined)?.total ?? feed.items.length;
  return (
    <div className="feed">
      <DialStrip dials={me.settings.feed} onOpen={() => setDials(true)} />
      {feed.first.loading && <SkeletonPosts />}
      <ErrorNote error={feed.first.error} retry={feed.first.reload} />
      {feed.items.map((post) => (
        <PostCard key={post.id} post={post} onRemoved={feed.remove} />
      ))}
      {feed.first.data &&
        (feed.end ? (
          <CaughtUp variant="mix" count={total} />
        ) : (
          <button className="btn btn-secondary" disabled={feed.loadingMore} onClick={feed.more}>
            {feed.loadingMore ? 'Loading…' : `Show more (${total - feed.items.length} left today)`}
          </button>
        ))}
      {dials && <DialsSheet onClose={() => setDials(false)} />}
    </div>
  );
}

export function Home() {
  const { query } = useRoute();
  const tab = query.get('feed') === 'mix' ? 'mix' : 'friends';
  return (
    <>
      <div className="home-head">
        <Segmented
          label="Feed"
          value={tab}
          onChange={(v) => (v === 'clips' ? navigate('/clips') : navigate(`/home?feed=${v}`, { replace: true }))}
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'mix', label: 'Mix' },
            { value: 'clips', label: (<><Clapperboard size={16} /> Clips</>) as unknown as string },
          ]}
        />
      </div>
      <Composer compact />
      {tab === 'friends' ? <FriendsFeed /> : <MixFeed />}
    </>
  );
}

export function DialsPage() {
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back()} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Feed Dials</h1>
      </div>
      <p className="muted">
        These shape your Mix feed and Clips. Your Friends feed always shows everything from people you follow, newest first.
      </p>
      <DialsEditor onSaved={() => navigate('/home?feed=mix')} />
    </>
  );
}

export function ComposePage() {
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back()} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>New post</h1>
      </div>
      <Composer onPosted={(p) => navigate(`/p/${p.id}`, { replace: true })} />
    </>
  );
}

export function SavedPage() {
  const saved = useApi<{ items: PostView[] }>('/me/saved');
  return (
    <>
      <div className="page-head">
        <h1>Saved</h1>
      </div>
      {saved.loading && <SkeletonPosts />}
      <ErrorNote error={saved.error} retry={saved.reload} />
      {saved.data?.items.length === 0 && (
        <Empty icon={<Bookmark size={26} />} title="Nothing saved yet">
          Tap the bookmark on any post to keep it here. Only you can see what you save.
        </Empty>
      )}
      <div className="feed">
        {saved.data?.items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </>
  );
}
