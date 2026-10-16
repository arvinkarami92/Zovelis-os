// Defaults, presets and catalogues shared by the server and the web client.

import type { FeedDials, ReactionType, UserSettings } from '../store/types.ts';

export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export interface Topic {
  id: string;
  label: string;
  emoji: string;
}

export const TOPICS: Topic[] = [
  { id: 'photography', label: 'Photography', emoji: '📷' },
  { id: 'hiking', label: 'Hiking', emoji: '🥾' },
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'music', label: 'Music', emoji: '🎧' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'tech', label: 'Tech', emoji: '💻' },
  { id: 'books', label: 'Books', emoji: '📚' },
  { id: 'fitness', label: 'Fitness', emoji: '🏃' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'gardening', label: 'Gardening', emoji: '🌱' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'film', label: 'Film', emoji: '🎬' },
  { id: 'science', label: 'Science', emoji: '🔭' },
  { id: 'pets', label: 'Pets', emoji: '🐾' },
  { id: 'fashion', label: 'Fashion', emoji: '🧥' },
  { id: 'wellness', label: 'Wellness', emoji: '🧘' },
  { id: 'diy', label: 'DIY', emoji: '🛠️' },
  { id: 'comedy', label: 'Comedy', emoji: '😂' },
  { id: 'climate', label: 'Climate', emoji: '🌍' },
  { id: 'design', label: 'Design', emoji: '✏️' },
  { id: 'coffee', label: 'Coffee', emoji: '☕' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'parenting', label: 'Parenting', emoji: '🧸' },
  { id: 'local', label: 'Local', emoji: '📍' },
];

export const REACTIONS: Array<{ type: ReactionType; emoji: string; label: string }> = [
  { type: 'love', emoji: '❤️', label: 'Love' },
  { type: 'haha', emoji: '😄', label: 'Haha' },
  { type: 'wow', emoji: '🤩', label: 'Wow' },
  { type: 'support', emoji: '🤗', label: 'Support' },
  { type: 'insight', emoji: '💡', label: 'Insightful' },
];

export interface FeedPreset {
  id: string;
  label: string;
  description: string;
  dials: Pick<FeedDials, 'friendsVsDiscover' | 'freshVsPopular' | 'calm'>;
}

export const FEED_PRESETS: FeedPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Mostly your people, a little discovery, heated posts turned down.',
    dials: { friendsVsDiscover: 30, freshVsPopular: 40, calm: 50 },
  },
  {
    id: 'people',
    label: 'Just my people',
    description: 'Only people you follow and spaces you joined. Nothing suggested.',
    dials: { friendsVsDiscover: 0, freshVsPopular: 15, calm: 30 },
  },
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'Lots of new voices in the topics you love.',
    dials: { friendsVsDiscover: 75, freshVsPopular: 55, calm: 40 },
  },
  {
    id: 'calm',
    label: 'Calm Sunday',
    description: 'Slow, kind and low-drama. Arguments sink to the bottom.',
    dials: { friendsVsDiscover: 25, freshVsPopular: 30, calm: 95 },
  },
];

export function defaultFeedDials(): FeedDials {
  return {
    ...FEED_PRESETS[0].dials,
    ai: 'show',
    boostTopics: [],
    muteTopics: [],
    mutedWords: [],
    preset: 'balanced',
  };
}

/** Settings for a new account. Teens get the protective defaults. */
export function defaultSettings(teen: boolean): UserSettings {
  return {
    feed: defaultFeedDials(),
    wellbeing: {
      dailyBudgetMin: teen ? 60 : 90,
      quietHours: true,
      quietStart: teen ? '22:00' : '23:00',
      quietEnd: '07:00',
      notifications: 'digest',
      intentPrompt: true,
      clipsSetSize: 8,
    },
    privacy: {
      privateAccount: teen,
      defaultAudience: teen ? 'friends' : 'followers',
      whoCanMessage: teen ? 'friends' : 'followers',
      whoCanComment: teen ? 'friends' : 'everyone',
      showCountsByDefault: false,
      hiddenWords: [],
      showFollowerCounts: true,
    },
    creator: {
      supportersEnabled: false,
      supportPriceCents: 300,
      supportPerks: '',
      tipsEnabled: !teen,
    },
    theme: 'system',
    textSize: 'md',
    recoveryFriendIds: [],
    plus: false,
    tzOffsetMin: 0,
  };
}

/** Handles nobody may register, to prevent impersonating the platform. */
export const RESERVED_HANDLES = new Set([
  'admin', 'administrator', 'zemvii', 'support', 'help', 'api', 'settings', 'about', 'explore', 'discover',
  'login', 'logout', 'signup', 'root', 'system', 'moderator', 'mod', 'staff', 'security', 'official', 'me',
  'null', 'undefined', 'plans', 'spaces', 'messages', 'notifications', 'clips', 'creator', 'wellbeing',
]);
