// Discover, search and topic pages.

import { useState, type FormEvent } from 'react';
import { ArrowLeft, Search, TrendingUp, VolumeX } from 'lucide-react';
import type { Explore, TrendingTopic } from '../../../server/src/services/feed.ts';
import type { PostView, SpaceView, UserSummary } from '../../../server/src/services/views.ts';
import { useApi } from '../lib/hooks.ts';
import { back, Link, navigate, useRoute } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { SceneArt } from '../art/SceneArt.tsx';
import { PostCard } from '../components/PostCard.tsx';
import { Empty, ErrorNote, SkeletonPosts, Spinner, UserRow, useToast } from '../components/ui.tsx';
import { PlanCard, SpaceCard } from './Community.tsx';
import { FollowButton } from './Profile.tsx';

function SearchBox({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form className="search-box" role="search" onSubmit={submit}>
      <Search size={18} aria-hidden="true" />
      <label htmlFor="search-q" className="sr-only">
        Search Zemvii
      </label>
      <input id="search-q" className="input" type="search" placeholder="People, topics, spaces, posts" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

function TopicChip({ t }: { t: Pick<TrendingTopic, 'topic' | 'emoji' | 'label'> & { people?: number } }) {
  return (
    <Link to={`/t/${encodeURIComponent(t.topic)}`} className="chip topic-chip">
      <span aria-hidden="true">{t.emoji === '#' ? '#' : t.emoji}</span> {t.label}
      {t.people ? <span className="muted num">{t.people} people</span> : null}
    </Link>
  );
}

export function Discover() {
  const { me } = useSession();
  const explore = useApi<Explore>('/explore');
  const data = explore.data;
  return (
    <>
      <div className="page-head">
        <h1>Discover</h1>
      </div>
      <SearchBox />
      <ErrorNote error={explore.error} retry={explore.reload} />
      {!data && !explore.error && <Spinner />}
      {data && (
        <>
          {data.trending.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>
                  <TrendingUp size={18} /> Talked about now
                </h2>
                <span className="muted small">by how many people, not how loud</span>
              </div>
              <div className="chips">
                {data.trending.map((t) => (
                  <TopicChip key={t.topic} t={t} />
                ))}
              </div>
            </section>
          )}

          {data.highlights.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Highlights</h2>
              </div>
              <div className="highlight-grid">
                {data.highlights.slice(0, 9).map((p) => {
                  const m = p.media[0];
                  return (
                    <Link key={p.id} to={`/p/${p.id}`} className="highlight" aria-label={`${p.author.name}: ${p.text.slice(0, 80)}`}>
                      {m?.type === 'art' && m.art ? <SceneArt scene={m.art.scene} seed={m.art.seed} /> : m?.url ? <img src={m.url} alt="" loading="lazy" /> : null}
                      <span className="highlight-name">{p.author.name.split(' ')[0]}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {me && data.people.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>People you may know</h2>
              </div>
              <div className="panel">
                {data.people.slice(0, 6).map(({ user, reason }) => (
                  <UserRow key={user.id} user={user} sub={reason} action={<FollowButton handle={user.handle} />} />
                ))}
              </div>
            </section>
          )}

          {data.plans.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>Plans near your people</h2>
                <Link to="/plans" className="small">
                  All plans
                </Link>
              </div>
              <div className="stack">
                {data.plans.slice(0, 3).map((p) => (
                  <PlanCard key={p.id} plan={p} />
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head">
              <h2>Spaces</h2>
              <Link to="/spaces" className="small">
                All spaces
              </Link>
            </div>
            <div className="space-grid">
              {data.spaces.slice(0, 4).map((s) => (
                <SpaceCard key={s.id} space={s} />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

interface SearchResult {
  people: UserSummary[];
  topics: Array<{ topic: string; label: string; emoji: string }>;
  spaces: SpaceView[];
  posts: PostView[];
}

export function SearchPage() {
  const { query } = useRoute();
  const q = query.get('q') ?? '';
  const result = useApi<SearchResult>(q ? `/search?q=${encodeURIComponent(q)}` : null);
  const data = result.data;
  const nothing = data && !data.people.length && !data.topics.length && !data.spaces.length && !data.posts.length;
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/discover')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>Search</h1>
      </div>
      <SearchBox initial={q} key={q} />
      {result.loading && <Spinner />}
      <ErrorNote error={result.error} />
      {nothing && <Empty title={`Nothing found for "${q}"`}>Try a name, a @handle or a #topic.</Empty>}
      {data && data.topics.length > 0 && (
        <section className="section">
          <h2>Topics</h2>
          <div className="chips">
            {data.topics.map((t) => (
              <TopicChip key={t.topic} t={t} />
            ))}
          </div>
        </section>
      )}
      {data && data.people.length > 0 && (
        <section className="section">
          <h2>People</h2>
          <div className="panel">
            {data.people.map((u) => (
              <UserRow key={u.id} user={u} action={<FollowButton handle={u.handle} />} />
            ))}
          </div>
        </section>
      )}
      {data && data.spaces.length > 0 && (
        <section className="section">
          <h2>Spaces</h2>
          <div className="space-grid">
            {data.spaces.map((s) => (
              <SpaceCard key={s.id} space={s} />
            ))}
          </div>
        </section>
      )}
      {data && data.posts.length > 0 && (
        <section className="section">
          <h2>Posts</h2>
          <div className="feed">
            {data.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

interface TopicData {
  topic: string;
  label: string;
  emoji: string;
  items: PostView[];
  nextCursor: string | null;
  spaces: SpaceView[];
}

export function TopicPage({ tag }: { tag: string }) {
  const { me, updateSettings } = useSession();
  const toast = useToast();
  const topic = useApi<TopicData>(`/topics/${encodeURIComponent(tag)}`);
  const id = tag.toLowerCase();
  const boosted = me?.settings.feed.boostTopics.includes(id) ?? false;
  const muted = me?.settings.feed.muteTopics.includes(id) ?? false;
  const toggle = async (kind: 'boost' | 'mute') => {
    if (!me) return navigate('/login');
    const feed = me.settings.feed;
    const boost = kind === 'boost' ? (boosted ? feed.boostTopics.filter((t) => t !== id) : [...feed.boostTopics, id]) : feed.boostTopics.filter((t) => t !== id);
    const mute = kind === 'mute' ? (muted ? feed.muteTopics.filter((t) => t !== id) : [...feed.muteTopics, id]) : feed.muteTopics.filter((t) => t !== id);
    await updateSettings({ feed: { boostTopics: boost, muteTopics: mute } });
    toast(kind === 'boost' ? (boosted ? `Stopped boosting #${id}` : `#${id} will rank higher in your Mix`) : muted ? `Unmuted #${id}` : `#${id} won't appear in your Mix`);
  };
  return (
    <>
      <div className="page-head">
        <button className="icon-btn back-btn" onClick={() => back('/discover')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h1>
          {topic.data && topic.data.emoji !== '#' ? `${topic.data.emoji} ` : '#'}
          {topic.data?.label ?? tag}
        </h1>
      </div>
      {me && (
        <div className="row">
          <button className={`chip${boosted ? ' is-on' : ''}`} aria-pressed={boosted} onClick={() => toggle('boost')}>
            <TrendingUp size={15} /> {boosted ? 'Boosted' : 'Boost in my Mix'}
          </button>
          <button className={`chip is-muted`} aria-pressed={muted} onClick={() => toggle('mute')}>
            <VolumeX size={15} /> {muted ? 'Muted' : 'Mute topic'}
          </button>
        </div>
      )}
      {topic.data && topic.data.spaces.length > 0 && (
        <div className="space-grid">
          {topic.data.spaces.map((s) => (
            <SpaceCard key={s.id} space={s} />
          ))}
        </div>
      )}
      {topic.loading && <SkeletonPosts />}
      <ErrorNote error={topic.error} />
      {topic.data?.items.length === 0 && <Empty title="No posts here yet">Be the first to post with #{tag}.</Empty>}
      <div className="feed">
        {topic.data?.items.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </>
  );
}
