// Clips come in sets. After each set, a pause: you decide whether to watch
// another, instead of an endless swipe deciding for you.

import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, Heart, MessageCircle, Sparkles, Wind } from 'lucide-react';
import type { PostView } from '../../../server/src/services/views.ts';
import { api, errorMessage } from '../api/client.ts';
import { Link, useRoute } from '../lib/router.tsx';
import { useMe } from '../lib/session.tsx';
import { SceneArt } from '../art/SceneArt.tsx';
import { RichText } from '../components/RichText.tsx';
import { Avatar, Empty, ErrorNote, OriginBadge, Spinner, VerifiedBadge, useToast } from '../components/ui.tsx';
import { WhySheet } from '../components/PostSheets.tsx';

interface ClipSet {
  items: PostView[];
  set: number;
  setSize: number;
  sets: number;
  end: boolean;
}

function ClipView({ post: initial }: { post: PostView }) {
  const [post, setPost] = useState(initial);
  const [why, setWhy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const toast = useToast();
  const media = post.media[0];

  useEffect(() => {
    const el = ref.current;
    if (!el || !video.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.current?.play().catch(() => {});
      else video.current?.pause();
    }, { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const love = async () => {
    try {
      setPost(post.myReaction ? await api.del<PostView>(`/posts/${post.id}/react`) : await api.post<PostView>(`/posts/${post.id}/react`, { type: 'love' }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const save = async () => {
    try {
      if (post.saved) await api.del(`/posts/${post.id}/save`);
      else await api.post(`/posts/${post.id}/save`);
      setPost({ ...post, saved: !post.saved });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="clip" ref={ref}>
      <div className="clip-media">
        {media?.type === 'art' && media.art && <SceneArt scene={media.art.scene} seed={media.art.seed} animated label={media.alt || undefined} />}
        {media?.type === 'video' && media.url && <video ref={video} src={media.url} muted loop playsInline controls={false} />}
        {media?.type === 'image' && media.url && <img src={media.url} alt={media.alt ?? ''} />}
      </div>
      <div className="clip-overlay">
        <div className="clip-info">
          <Link to={`/u/${post.author.handle}`} className="clip-author">
            <Avatar user={post.author} size={34} />
            <strong>{post.author.name}</strong>
            {post.author.verifiedHuman && <VerifiedBadge small />}
          </Link>
          {post.origin !== 'human' && <OriginBadge origin={post.origin} />}
          {post.text && (
            <p className="clip-text">
              <RichText text={post.text} />
            </p>
          )}
          {post.why?.[0] && (
            <button className="why-chip clip-why" onClick={() => setWhy(true)}>
              <Sparkles size={13} /> <span>{post.why[0].text}</span>
            </button>
          )}
        </div>
        <div className="clip-actions">
          <button className={`clip-act${post.myReaction ? ' is-on' : ''}`} onClick={love} aria-label={post.myReaction ? 'Remove reaction' : 'Love'}>
            <Heart size={26} fill={post.myReaction ? 'currentColor' : 'none'} />
          </button>
          <Link to={`/p/${post.id}`} className="clip-act" aria-label={`${post.commentCount} comments`}>
            <MessageCircle size={26} />
            <span>{post.commentCount || ''}</span>
          </Link>
          <button className="clip-act" onClick={save} aria-label={post.saved ? 'Unsave' : 'Save'}>
            {post.saved ? <BookmarkCheck size={26} /> : <Bookmark size={26} />}
          </button>
        </div>
      </div>
      {why && <WhySheet postId={post.id} onClose={() => setWhy(false)} />}
    </div>
  );
}

function SetBreak({ watched, setNumber, end, onNext }: { watched: number; setNumber: number; end: boolean; onNext?: () => void }) {
  return (
    <div className="clip clip-break">
      <div className="breathe" aria-hidden="true" />
      <h2>{end ? "That's every clip for now" : `Set ${setNumber} done`}</h2>
      <p>
        You watched {watched} clips. {end ? 'New ones will be here later.' : 'Take a breath. Want another set?'}
      </p>
      <div className="stack">
        {!end && onNext && (
          <button className="btn btn-primary" onClick={onNext}>
            <Wind size={18} /> Watch another set
          </button>
        )}
        <Link to="/home?feed=friends" className="btn btn-secondary">
          Back to my friends
        </Link>
      </div>
    </div>
  );
}

export function Clips() {
  const me = useMe();
  const { query } = useRoute();
  const startId = query.get('start');
  const [sets, setSets] = useState<ClipSet[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const load = async (set: number) => {
    setLoading(true);
    try {
      const page = await api.get<ClipSet>(`/feed/clips?set=${set}`);
      if (set === 0 && startId && !page.items.some((p) => p.id === startId)) {
        try {
          page.items.unshift(await api.get<PostView>(`/posts/${startId}`));
        } catch {
          // the clip is gone; start with the set
        }
      } else if (set === 0 && startId) {
        const index = page.items.findIndex((p) => p.id === startId);
        page.items.unshift(...page.items.splice(index, 1));
      }
      setSets((list) => [...list.filter((s) => s.set !== set), page]);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSets([]);
    void load(0);
  }, [startId, me.settings.feed.friendsVsDiscover]);

  const next = async () => {
    const last = sets[sets.length - 1];
    await load(last.set + 1);
    requestAnimationFrame(() => {
      const breaks = scroller.current?.querySelectorAll('.clip-break');
      const target = breaks?.[breaks.length - 1]?.nextElementSibling as HTMLElement | undefined;
      target?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  if (loading && sets.length === 0) return <Spinner label="Loading clips" />;
  if (error) return <ErrorNote error={error} retry={() => void load(0)} />;
  if (sets.length > 0 && sets[0].items.length === 0) {
    return (
      <Empty title="No clips yet" action={<button className="btn btn-primary" onClick={() => dispatchEvent(new Event('zemvii:compose'))}>Post a clip</button>}>
        Clips from people you follow and topics you love will appear here.
      </Empty>
    );
  }
  let watched = 0;
  return (
    <div className="clips" ref={scroller}>
      {sets.map((s, i) => {
        watched += s.items.length;
        const isLast = i === sets.length - 1;
        return (
          <div key={s.set} className="clip-set">
            {s.items.map((post) => (
              <ClipView key={post.id} post={post} />
            ))}
            <SetBreak watched={watched} setNumber={s.set + 1} end={s.end} onNext={isLast ? next : undefined} />
          </div>
        );
      })}
    </div>
  );
}
