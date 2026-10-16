// Write a post: text, photos or video or generative art, an audience, and an
// honest origin label.

import { useRef, useState } from 'react';
import { Bot, Clapperboard, Globe, Heart, ImagePlus, Leaf, Lock, Palette, Sparkles, Star, Users, X } from 'lucide-react';
import type { CircleView } from '../../../server/src/services/graph.ts';
import type { PostView } from '../../../server/src/services/views.ts';
import type { Audience, MediaItem, Origin } from '../../../server/src/store/types.ts';
import { api, errorMessage } from '../api/client.ts';
import { invalidate, useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { prepareUpload } from '../lib/image.ts';
import { SceneArt } from '../art/SceneArt.tsx';
import { Avatar, ORIGIN_LABELS, Sheet, useToast } from './ui.tsx';
import { LiveToneHint, ToneNudge, useToneGuard } from './Tone.tsx';

type Draft = (MediaItem & { uploading?: boolean }) | { id: string; type: 'art'; art: { scene: string; seed: number } };

export interface ComposerDefaults {
  spaceId?: string;
  spaceName?: string;
  planId?: string;
  planTitle?: string;
  kind?: 'post' | 'clip';
  text?: string;
}

const AUDIENCES: Array<{ value: Audience; label: string; icon: typeof Globe }> = [
  { value: 'public', label: 'Public', icon: Globe },
  { value: 'followers', label: 'Followers', icon: Users },
  { value: 'friends', label: 'Friends', icon: Heart },
  { value: 'circle', label: 'A circle', icon: Heart },
  { value: 'supporters', label: 'Supporters', icon: Star },
  { value: 'private', label: 'Only me', icon: Lock },
];

const ORIGIN_ICONS: Record<Origin, typeof Leaf> = { human: Leaf, ai_assisted: Sparkles, ai_generated: Bot };

export function Composer({ defaults = {}, onPosted, compact }: { defaults?: ComposerDefaults; onPosted?: (post: PostView) => void; compact?: boolean }) {
  const { me, meta } = useSession();
  const toast = useToast();
  const [text, setText] = useState(defaults.text ?? '');
  const [media, setMedia] = useState<Draft[]>([]);
  const [audience, setAudience] = useState<Audience>(me?.settings.privacy.defaultAudience ?? 'followers');
  const [circleId, setCircleId] = useState<string>('');
  const [origin, setOrigin] = useState<Origin>('human');
  const [kind, setKind] = useState<'post' | 'clip'>(defaults.kind ?? 'post');
  const [artPicker, setArtPicker] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const file = useRef<HTMLInputElement>(null);
  const guard = useToneGuard();
  const circles = useApi<{ items: CircleView[] }>(audience === 'circle' ? '/circles' : null);
  const inSpace = Boolean(defaults.spaceId);
  if (!me) return null;

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of [...files].slice(0, 4 - media.length)) {
      const tempId = `tmp-${Math.random()}`;
      setMedia((list) => [...list, { id: tempId, type: f.type.startsWith('video/') ? 'video' : 'image', url: URL.createObjectURL(f), uploading: true }]);
      try {
        const uploaded = await api.upload(await prepareUpload(f));
        setMedia((list) => list.map((m) => (m.id === tempId ? { id: uploaded.id, type: uploaded.mime.startsWith('video/') ? 'video' : 'image', url: uploaded.url, mime: uploaded.mime } : m)));
      } catch (e) {
        setMedia((list) => list.filter((m) => m.id !== tempId));
        toast(errorMessage(e), 'error');
      }
    }
  };

  const submit = (confirmTone = false) =>
    guard.run(async () => {
      const post = await api.post<PostView>('/posts', {
        text,
        kind,
        origin,
        audience: inSpace ? 'space' : audience,
        circleId: audience === 'circle' ? circleId : undefined,
        spaceId: defaults.spaceId,
        planId: defaults.planId,
        media: media.map((m) => (m.type === 'art' ? { type: 'art', art: m.art } : { type: m.type, id: m.id, alt: 'alt' in m ? m.alt : '' })),
        confirmTone,
      });
      setText('');
      setMedia([]);
      setKind('post');
      toast(kind === 'clip' ? 'Clip posted' : 'Posted');
      invalidate('/feed', '/users', '/spaces', '/plans');
      onPosted?.(post);
    });

  const canPost = (text.trim().length > 0 || media.length > 0) && !media.some((m) => 'uploading' in m && m.uploading) && (audience !== 'circle' || circleId || inSpace);
  const audiences = AUDIENCES.filter((a) => (a.value !== 'supporters' || me.settings.creator.supportersEnabled) && !(me.teen && a.value === 'supporters'));

  if (!expanded) {
    return (
      <button className="composer-collapsed" onClick={() => setExpanded(true)}>
        <Avatar user={me} size={36} />
        <span>{inSpace ? `Share with ${defaults.spaceName}…` : defaults.planTitle ? 'Add a memory from this plan…' : "What's on your mind?"}</span>
      </button>
    );
  }

  return (
    <div className="composer">
      <div className="composer-top">
        <Avatar user={me} size={40} />
        <div className="grow stack">
          <label htmlFor="composer-text" className="sr-only">
            Post text
          </label>
          <textarea
            id="composer-text"
            className="composer-text"
            placeholder={defaults.planTitle ? `A memory from ${defaults.planTitle}…` : inSpace ? `Share with ${defaults.spaceName}…` : 'Share something with your people…'}
            value={text}
            maxLength={2200}
            onChange={(e) => setText(e.target.value)}
            rows={compact ? 2 : 4}
          />
          <LiveToneHint text={text} />
        </div>
      </div>

      {media.length > 0 && (
        <div className="composer-media">
          {media.map((m) => (
            <div key={m.id} className="composer-thumb">
              {m.type === 'art' && 'art' in m && m.art ? (
                <SceneArt scene={m.art.scene} seed={m.art.seed} />
              ) : m.type === 'video' ? (
                <video src={(m as MediaItem).url} muted playsInline />
              ) : (
                <img src={(m as MediaItem).url} alt="" />
              )}
              {'uploading' in m && m.uploading && <span className="thumb-loading">Uploading…</span>}
              <button className="thumb-remove" aria-label="Remove" onClick={() => setMedia((list) => list.filter((x) => x.id !== m.id))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer-tools">
        <input ref={file} id="composer-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        <button className="act" onClick={() => file.current?.click()} disabled={media.length >= 4}>
          <ImagePlus size={18} /> Photo/video
        </button>
        <button className="act" onClick={() => setArtPicker(true)} disabled={media.length >= 4}>
          <Palette size={18} /> Art
        </button>
        <button className={`act${kind === 'clip' ? ' is-saved' : ''}`} aria-pressed={kind === 'clip'} onClick={() => setKind(kind === 'clip' ? 'post' : 'clip')}>
          <Clapperboard size={18} /> Clip
        </button>
      </div>

      <div className="composer-options">
        {inSpace ? (
          <span className="pill pill-brand">Posting in {defaults.spaceName}</span>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">Who can see it</span>
            <div className="chips" role="radiogroup" aria-label="Who can see it">
              {audiences.map((a) => (
                <button key={a.value} role="radio" aria-checked={audience === a.value} className="chip" aria-pressed={audience === a.value} onClick={() => setAudience(a.value)}>
                  <a.icon size={14} /> {a.label}
                </button>
              ))}
            </div>
            {audience === 'circle' && (
              <select id="composer-circle" className="select" value={circleId} onChange={(e) => setCircleId(e.target.value)} aria-label="Choose a circle">
                <option value="">Choose a circle…</option>
                {circles.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name} ({c.members.length})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">How was it made</span>
          <div className="chips" role="radiogroup" aria-label="How was it made">
            {(Object.keys(ORIGIN_LABELS) as Origin[]).map((o) => {
              const Icon = ORIGIN_ICONS[o];
              return (
                <button key={o} role="radio" aria-checked={origin === o} className="chip" aria-pressed={origin === o} title={ORIGIN_LABELS[o].help} onClick={() => setOrigin(o)}>
                  <Icon size={14} /> {ORIGIN_LABELS[o].label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {guard.nudge && <ToneNudge tone={guard.nudge} onEdit={guard.clear} onPostAnyway={() => void submit(true)} />}
      {guard.error && <div className="field-error">{guard.error}</div>}

      <div className="row-between">
        <span className="muted small">
          {audience === 'public' || audience === 'followers' ? 'Everyone who follows you will see it in their Friends feed.' : audience === 'private' ? 'Only you will see it.' : ' '}
        </span>
        <button className="btn btn-primary" disabled={!canPost || guard.busy} onClick={() => void submit()}>
          {kind === 'clip' ? 'Post clip' : 'Post'}
        </button>
      </div>

      {artPicker && (
        <Sheet title="Add generative art" onClose={() => setArtPicker(false)}>
          <p className="muted">Pick a scene. Each one is drawn from code, so it's labelled human-made art unless you say otherwise.</p>
          <div className="art-grid">
            {(meta?.artScenes ?? []).map((scene) => {
              const seed = Math.floor(Math.random() * 100000);
              return (
                <button
                  key={scene}
                  className="art-option"
                  onClick={() => {
                    setMedia((list) => [...list, { id: `art-${scene}-${seed}`, type: 'art', art: { scene, seed } }]);
                    setArtPicker(false);
                  }}
                >
                  <SceneArt scene={scene} seed={seed} />
                  <span>{scene}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function ComposeSheet({ onClose, defaults }: { onClose: () => void; defaults?: ComposerDefaults }) {
  return (
    <Sheet title={defaults?.kind === 'clip' ? 'New clip' : 'New post'} onClose={onClose} wide>
      <Composer defaults={defaults} onPosted={onClose} />
    </Sheet>
  );
}
