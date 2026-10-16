// Row types for every table. These are the single source of truth for the
// data model: both storage adapters, the services and the web client use them.

export type ID = string;
/** Milliseconds since the Unix epoch. */
export type Millis = number;

export type Audience =
  | 'public' // anyone, including Discover
  | 'followers' // people who follow the author
  | 'friends' // mutual follows
  | 'circle' // members of one of the author's circles
  | 'supporters' // the author's paying supporters
  | 'space' // members of a space
  | 'private'; // only the author

export type Origin = 'human' | 'ai_assisted' | 'ai_generated';
export type ReactionType = 'love' | 'haha' | 'wow' | 'support' | 'insight';
export type PostKind = 'post' | 'clip';
export type ReplyControl = 'everyone' | 'followers' | 'friends' | 'nobody';
export type Visibility = 'visible' | 'removed' | 'deleted';

export interface ArtSpec {
  scene: string;
  seed: number;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'art';
  url?: string;
  mime?: string;
  width?: number;
  height?: number;
  alt?: string;
  /** Generative artwork used by the demo seed (rendered by the web client). */
  art?: ArtSpec;
}

export interface FeedDials {
  /** 0 = only people I follow, 100 = mostly discovery. */
  friendsVsDiscover: number;
  /** 0 = newest first, 100 = most appreciated first. */
  freshVsPopular: number;
  /** 0 = no effect, 100 = strongly lower heated and outrage content. */
  calm: number;
  /** Whether AI-generated posts appear at all. */
  ai: 'show' | 'hide';
  boostTopics: string[];
  muteTopics: string[];
  mutedWords: string[];
  preset: string;
}

export interface WellbeingSettings {
  /** Daily time budget in minutes; 0 switches the check-in off. */
  dailyBudgetMin: number;
  quietHours: boolean;
  /** "HH:MM" local time. */
  quietStart: string;
  quietEnd: string;
  /** 'digest' batches non-urgent notifications into a few deliveries a day. */
  notifications: 'realtime' | 'digest';
  intentPrompt: boolean;
  clipsSetSize: number;
}

export interface PrivacySettings {
  privateAccount: boolean;
  defaultAudience: Audience;
  whoCanMessage: 'everyone' | 'followers' | 'friends';
  whoCanComment: ReplyControl;
  /** Default for new posts: show reaction counts to everyone (otherwise only to me). */
  showCountsByDefault: boolean;
  /** Comments containing these words are hidden on my posts. */
  hiddenWords: string[];
  showFollowerCounts: boolean;
}

export interface CreatorSettings {
  supportersEnabled: boolean;
  supportPriceCents: number;
  supportPerks: string;
  tipsEnabled: boolean;
}

export interface UserSettings {
  feed: FeedDials;
  wellbeing: WellbeingSettings;
  privacy: PrivacySettings;
  creator: CreatorSettings;
  theme: 'system' | 'light' | 'dark';
  textSize: 'sm' | 'md' | 'lg';
  recoveryFriendIds: ID[];
  plus: boolean;
  /** Minutes east of UTC, reported by the client; used for quiet hours and digests. */
  tzOffsetMin: number;
}

export interface UserRow {
  id: ID;
  handle: string;
  name: string;
  email: string;
  passwordHash: string;
  bio: string;
  pronouns: string;
  location: string;
  website: string;
  avatarUrl: string | null;
  /** Hue (0–360) for the generated avatar and profile header. */
  hue: number;
  /** "YYYY-MM-DD". Used only to apply age protections. */
  birthDate: string;
  verifiedHuman: boolean;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  suspendedUntil: Millis | null;
  settings: UserSettings;
  /** Interests chosen at onboarding. */
  topics: string[];
  walletCents: number;
  /** Newest Friends-feed post this user has seen ("You're all caught up"). */
  feedSeenAt: Millis;
  /** Demo-only: a seeded persona that answers messages automatically. */
  bot: boolean;
  createdAt: Millis;
  lastActiveAt: Millis;
}

export interface SessionRow {
  /** SHA-256 of the session token; the token itself is never stored. */
  id: ID;
  userId: ID;
  userAgent: string;
  createdAt: Millis;
  expiresAt: Millis;
  lastSeenAt: Millis;
}

export interface FollowRow {
  id: ID;
  followerId: ID;
  followeeId: ID;
  status: 'active' | 'pending';
  createdAt: Millis;
}

export interface CircleRow {
  id: ID;
  ownerId: ID;
  name: string;
  emoji: string;
  hue: number;
  createdAt: Millis;
}

export interface CircleMemberRow {
  id: ID;
  circleId: ID;
  ownerId: ID;
  userId: ID;
  createdAt: Millis;
}

export interface PostRow {
  id: ID;
  authorId: ID;
  kind: PostKind;
  text: string;
  media: MediaItem[];
  audience: Audience;
  circleId: ID | null;
  spaceId: ID | null;
  planId: ID | null;
  origin: Origin;
  topics: string[];
  mentions: string[];
  replyControl: ReplyControl;
  showCounts: boolean;
  sponsored: boolean;
  sponsorName: string | null;
  /** Heat score 0–1 from the tone check, used by the Calm dial. */
  heat: number;
  reactionCount: number;
  commentCount: number;
  saveCount: number;
  tipCents: number;
  status: Visibility;
  createdAt: Millis;
  editedAt: Millis | null;
}

/** One row per (post, topic) so topic pages and trending don't scan posts. */
export interface PostTopicRow {
  id: ID;
  postId: ID;
  topic: string;
  authorId: ID;
  /** Public, non-sponsored posts only count towards trending and topic pages. */
  isPublic: boolean;
  createdAt: Millis;
}

export interface ReactionRow {
  id: ID;
  postId: ID;
  userId: ID;
  type: ReactionType;
  createdAt: Millis;
}

export interface CommentRow {
  id: ID;
  postId: ID;
  authorId: ID;
  parentId: ID | null;
  text: string;
  heat: number;
  /** The writer saw a "Pause & rethink" nudge and posted anyway. */
  nudged: boolean;
  status: Visibility;
  createdAt: Millis;
}

export interface SaveRow {
  id: ID;
  userId: ID;
  postId: ID;
  createdAt: Millis;
}

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'tip'
  | 'support'
  | 'plan_invite'
  | 'plan_rsvp'
  | 'space_join'
  | 'note'
  | 'moderation'
  | 'appeal'
  | 'recovery_request'
  | 'recovery_approved'
  | 'system';

export interface NotificationRow {
  id: ID;
  userId: ID;
  actorId: ID | null;
  type: NotificationType;
  postId: ID | null;
  commentId: ID | null;
  planId: ID | null;
  spaceId: ID | null;
  text: string;
  createdAt: Millis;
  /** In digest mode, when this notification becomes visible. */
  deliverAt: Millis;
  readAt: Millis | null;
}

export interface ConversationRow {
  id: ID;
  kind: 'direct' | 'group';
  title: string | null;
  /** For direct chats: the two user ids sorted and joined, so each pair has one chat. */
  directKey: string | null;
  createdBy: ID;
  createdAt: Millis;
  lastMessageAt: Millis;
}

export interface ConversationMemberRow {
  id: ID;
  conversationId: ID;
  userId: ID;
  /** False while the chat is a message request the user has not accepted. */
  accepted: boolean;
  muted: boolean;
  lastReadAt: Millis;
  createdAt: Millis;
}

export interface MessageRow {
  id: ID;
  conversationId: ID;
  senderId: ID;
  text: string;
  media: MediaItem[];
  /** A plan shared into the chat. */
  planId: ID | null;
  status: Visibility;
  createdAt: Millis;
}

export interface BlockRow {
  id: ID;
  blockerId: ID;
  blockedId: ID;
  createdAt: Millis;
}

export interface MuteRow {
  id: ID;
  muterId: ID;
  mutedId: ID;
  createdAt: Millis;
}

export type ReportTarget = 'post' | 'comment' | 'user' | 'message' | 'space' | 'plan';
export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'violence'
  | 'self_harm'
  | 'spam'
  | 'scam'
  | 'nudity'
  | 'misinformation'
  | 'undisclosed_ai'
  | 'impersonation'
  | 'underage'
  | 'other';

export interface ReportRow {
  id: ID;
  reporterId: ID;
  targetType: ReportTarget;
  targetId: ID;
  targetUserId: ID | null;
  reason: ReportReason;
  details: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: Millis;
  resolvedAt: Millis | null;
  resolvedBy: ID | null;
}

export interface ModerationActionRow {
  id: ID;
  userId: ID;
  reportId: ID | null;
  targetType: ReportTarget;
  targetId: ID;
  action: 'remove' | 'warn' | 'suspend' | 'label_ai';
  reason: ReportReason;
  /** Plain-language explanation shown to the user on their Account Status page. */
  explanation: string;
  createdBy: ID;
  createdAt: Millis;
  appealStatus: 'none' | 'pending' | 'upheld' | 'overturned';
  appealText: string;
  appealAt: Millis | null;
  appealResolvedAt: Millis | null;
}

export interface NoteRow {
  id: ID;
  postId: ID;
  authorId: ID;
  text: string;
  helpful: number;
  notHelpful: number;
  status: 'proposed' | 'shown';
  createdAt: Millis;
}

export interface NoteRatingRow {
  id: ID;
  noteId: ID;
  userId: ID;
  helpful: boolean;
  createdAt: Millis;
}

export interface SpaceRow {
  id: ID;
  slug: string;
  name: string;
  description: string;
  emoji: string;
  hue: number;
  visibility: 'public' | 'private';
  ownerId: ID;
  rules: string[];
  topics: string[];
  location: string;
  memberCount: number;
  createdAt: Millis;
}

export interface SpaceMemberRow {
  id: ID;
  spaceId: ID;
  userId: ID;
  role: 'owner' | 'mod' | 'member';
  createdAt: Millis;
}

export interface PlanRow {
  id: ID;
  hostId: ID;
  title: string;
  description: string;
  startsAt: Millis;
  endsAt: Millis | null;
  location: string;
  audience: 'public' | 'friends' | 'circle' | 'space';
  circleId: ID | null;
  spaceId: ID | null;
  capacity: number | null;
  hue: number;
  emoji: string;
  goingCount: number;
  status: 'active' | 'cancelled';
  createdAt: Millis;
}

export interface RsvpRow {
  id: ID;
  planId: ID;
  userId: ID;
  status: 'going' | 'maybe' | 'no';
  createdAt: Millis;
}

export interface TransactionRow {
  id: ID;
  kind: 'tip' | 'support' | 'topup' | 'payout';
  fromUserId: ID | null;
  toUserId: ID | null;
  grossCents: number;
  feeCents: number;
  netCents: number;
  postId: ID | null;
  note: string;
  createdAt: Millis;
}

export interface SupportRow {
  id: ID;
  creatorId: ID;
  supporterId: ID;
  priceCents: number;
  status: 'active' | 'cancelled';
  startedAt: Millis;
  renewsAt: Millis;
  cancelledAt: Millis | null;
}

export interface UsageRow {
  id: ID;
  userId: ID;
  /** Local day, "YYYY-MM-DD". */
  day: string;
  seconds: number;
  sessions: number;
  intents: Record<string, number>;
  updatedAt: Millis;
}

export interface RecoveryRow {
  id: ID;
  userId: ID;
  /** SHA-256 of the secret the requester holds; only they can finish the recovery. */
  secretHash: string;
  approvals: ID[];
  status: 'pending' | 'approved' | 'completed' | 'expired';
  createdAt: Millis;
  expiresAt: Millis;
}

export interface MediaRow {
  id: ID;
  ownerId: ID;
  mime: string;
  size: number;
  url: string;
  createdAt: Millis;
}

export interface Tables {
  users: UserRow;
  sessions: SessionRow;
  follows: FollowRow;
  circles: CircleRow;
  circleMembers: CircleMemberRow;
  posts: PostRow;
  postTopics: PostTopicRow;
  reactions: ReactionRow;
  comments: CommentRow;
  saves: SaveRow;
  notifications: NotificationRow;
  conversations: ConversationRow;
  conversationMembers: ConversationMemberRow;
  messages: MessageRow;
  blocks: BlockRow;
  mutes: MuteRow;
  reports: ReportRow;
  moderationActions: ModerationActionRow;
  notes: NoteRow;
  noteRatings: NoteRatingRow;
  spaces: SpaceRow;
  spaceMembers: SpaceMemberRow;
  plans: PlanRow;
  rsvps: RsvpRow;
  transactions: TransactionRow;
  supports: SupportRow;
  usage: UsageRow;
  recoveries: RecoveryRow;
  media: MediaRow;
}

export type TableName = keyof Tables;
