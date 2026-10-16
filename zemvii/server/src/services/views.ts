// The shapes the API returns. Private fields (email, password hash, birth
// date, settings) only ever appear in `MeView`, for the account owner.

import type { Breakdown, Reason } from '../core/feed.ts';
import type { ToneResult } from '../core/tone.ts';
import type {
  Audience, ID, MediaItem, ModerationActionRow, NotificationType, Origin, PlanRow, PostKind, ReactionType,
  ReplyControl, ReportReason, ReportTarget, SpaceRow, UserRow, UserSettings,
} from '../store/types.ts';
import { isTeen } from '../core/age.ts';

export interface UserSummary {
  id: ID;
  handle: string;
  name: string;
  avatarUrl: string | null;
  hue: number;
  verifiedHuman: boolean;
  privateAccount: boolean;
}

export interface MeView extends UserSummary {
  email: string;
  bio: string;
  pronouns: string;
  location: string;
  website: string;
  birthDate: string;
  teen: boolean;
  role: UserRow['role'];
  status: UserRow['status'];
  suspendedUntil: number | null;
  settings: UserSettings;
  topics: string[];
  walletCents: number;
  feedSeenAt: number;
  createdAt: number;
}

export interface Relationship {
  /** My follow of them. */
  following: 'none' | 'pending' | 'active';
  followsYou: boolean;
  friend: boolean;
  blocked: boolean;
  muted: boolean;
  /** My circles that include them. */
  circleIds: ID[];
  supporting: boolean;
}

export interface ProfileView extends UserSummary {
  bio: string;
  pronouns: string;
  location: string;
  website: string;
  createdAt: number;
  counts: { followers: number | null; following: number | null; posts: number };
  relationship: Relationship | null;
  /** False when the account is private and the viewer is not an approved follower. */
  canSeePosts: boolean;
  creator: { tipsEnabled: boolean; supportersEnabled: boolean; supportPriceCents: number; supportPerks: string; supporters: number | null };
  isMe: boolean;
}

export interface NoteView {
  id: ID;
  text: string;
  helpful: number;
  notHelpful: number;
  shown: boolean;
  myRating: boolean | null;
  mine: boolean;
}

export interface PostView {
  id: ID;
  kind: PostKind;
  text: string;
  media: MediaItem[];
  audience: Audience;
  circle: { id: ID; name: string; emoji: string } | null;
  space: { id: ID; slug: string; name: string; emoji: string } | null;
  plan: { id: ID; title: string } | null;
  origin: Origin;
  topics: string[];
  replyControl: ReplyControl;
  showCounts: boolean;
  createdAt: number;
  editedAt: number | null;
  status: 'visible' | 'removed';
  author: UserSummary;
  /** Reaction totals by type; null when the author keeps counts private. */
  reactions: Partial<Record<ReactionType, number>> | null;
  reactionTotal: number | null;
  commentCount: number;
  /** Up to three people the viewer knows who reacted. */
  reactedBy: UserSummary[];
  myReaction: ReactionType | null;
  saved: boolean;
  canReply: boolean;
  canEdit: boolean;
  canTip: boolean;
  /** Only shown to the author. */
  tipCents: number | null;
  note: NoteView | null;
  sponsored: boolean;
  sponsorName: string | null;
  /** Short explanation from the ranking (Mix and Clips feeds). */
  why: Reason[] | null;
}

export interface CommentView {
  id: ID;
  postId: ID;
  parentId: ID | null;
  text: string;
  createdAt: number;
  author: UserSummary;
  canDelete: boolean;
  /** Hidden from others by the post author's hidden-words filter. */
  filtered: boolean;
}

export interface FeedPage {
  items: PostView[];
  nextCursor: string | null;
  /** True when there is nothing more: show "You're all caught up". */
  end: boolean;
  /** Friends feed: posts newer than this were new on this visit. */
  seenAt?: number;
  newCount?: number;
}

export interface WhyView {
  postId: ID;
  shown: boolean;
  excludedBecause: string | null;
  reasons: Reason[];
  breakdown: Breakdown | null;
  dials: { friendsVsDiscover: number; freshVsPopular: number; calm: number; ai: 'show' | 'hide' };
  feedNote: string;
}

export interface NotificationView {
  id: ID;
  type: NotificationType;
  text: string;
  actor: UserSummary | null;
  postId: ID | null;
  planId: ID | null;
  spaceSlug: string | null;
  createdAt: number;
  read: boolean;
}

export interface ConversationView {
  id: ID;
  kind: 'direct' | 'group';
  title: string;
  members: UserSummary[];
  lastMessage: { text: string; senderId: ID; createdAt: number } | null;
  unread: number;
  accepted: boolean;
  muted: boolean;
}

export interface MessageView {
  id: ID;
  conversationId: ID;
  sender: UserSummary;
  text: string;
  media: MediaItem[];
  plan: PlanView | null;
  createdAt: number;
  mine: boolean;
}

export interface SpaceView {
  id: ID;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  hue: number;
  visibility: SpaceRow['visibility'];
  rules: string[];
  topics: string[];
  location: string;
  memberCount: number;
  owner: UserSummary | null;
  myRole: 'owner' | 'mod' | 'member' | null;
  createdAt: number;
}

export interface PlanView {
  id: ID;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number | null;
  location: string;
  audience: PlanRow['audience'];
  circle: { id: ID; name: string } | null;
  space: { slug: string; name: string } | null;
  capacity: number | null;
  hue: number;
  emoji: string;
  goingCount: number;
  host: UserSummary;
  myRsvp: 'going' | 'maybe' | 'no' | null;
  friendsGoing: UserSummary[];
  cancelled: boolean;
  isHost: boolean;
}

export interface ToneBlock {
  code: 'tone_nudge' | 'tone_threat';
  tone: ToneResult;
}

export interface ReportView {
  targetType: ReportTarget;
  targetId: ID;
  reasons: ReportReason[];
  reports: number;
  firstReportedAt: number;
  reportIds: ID[];
  preview: string;
  targetUser: UserSummary | null;
  details: string[];
}

export interface ModerationView extends Omit<ModerationActionRow, 'createdBy'> {
  preview: string;
}

export function userSummary(user: UserRow): UserSummary {
  return {
    id: user.id,
    handle: user.handle,
    name: user.name,
    avatarUrl: user.avatarUrl,
    hue: user.hue,
    verifiedHuman: user.verifiedHuman,
    privateAccount: user.settings.privacy.privateAccount,
  };
}

export function meView(user: UserRow, now: number): MeView {
  return {
    ...userSummary(user),
    email: user.email,
    bio: user.bio,
    pronouns: user.pronouns,
    location: user.location,
    website: user.website,
    birthDate: user.birthDate,
    teen: isTeen(user.birthDate, now),
    role: user.role,
    status: user.status,
    suspendedUntil: user.suspendedUntil,
    settings: user.settings,
    topics: user.topics,
    walletCents: user.walletCents,
    feedSeenAt: user.feedSeenAt,
    createdAt: user.createdAt,
  };
}
