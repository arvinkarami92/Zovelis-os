// Product story shown on the landing page and the Why Zemvii page.
// Facts about other platforms are summarised from docs/STRATEGY.md (with sources).

export interface Pillar {
  title: string;
  problem: string;
  answer: string;
  tryIt: { label: string; to: string };
}

export const PILLARS: Pillar[] = [
  {
    title: 'Your people first',
    problem: 'Feeds bury posts from people you follow under recommendations and Reels.',
    answer: 'The Friends feed shows everyone you follow, newest first, complete. Circles send each post to exactly the right people.',
    tryIt: { label: 'Open your Friends feed', to: '/home?feed=friends' },
  },
  {
    title: 'Your feed, your rules',
    problem: "You can't see or change why the algorithm shows you things.",
    answer: 'Feed Dials tune the Mix feed in plain language, and every post can show the real formula that ranked it.',
    tryIt: { label: 'Tune your Feed Dials', to: '/dials' },
  },
  {
    title: 'A finish line',
    problem: 'Infinite scroll, autoplay and notification bait are designed to keep you hooked.',
    answer: "\"You're all caught up\", Clips in sets with a breather, a daily time budget you choose, quiet hours and notification digests.",
    tryIt: { label: 'See your Wellbeing', to: '/wellbeing' },
  },
  {
    title: 'Real humans, honest media',
    problem: 'AI slop and bots flood feeds; platform labels are inconsistent.',
    answer: 'Every post says Human-made, AI-assisted or AI-generated. One switch hides AI content. Verified-human badges without storing ID.',
    tryIt: { label: 'Hide AI posts', to: '/dials' },
  },
  {
    title: 'Kind by design',
    problem: 'Harassment is cheap; moderation arrives after the damage.',
    answer: '"Pause & rethink" nudges before hurtful words, threats are blocked, and the Calm dial lowers outrage in your feed.',
    tryIt: { label: 'Write a post', to: '/compose' },
  },
  {
    title: 'Real life, not just screens',
    problem: 'Social apps keep you on the couch.',
    answer: 'Plans turn chats into meetups with RSVPs, and collect shared memories afterwards. Spaces are communities with rules.',
    tryIt: { label: 'Browse plans', to: '/plans' },
  },
  {
    title: 'Fair to creators',
    problem: 'Creator funds shrink and reach is rationed.',
    answer: 'Creators keep 90% of tips and supporter memberships. Your followers always see your posts in their Friends feed.',
    tryIt: { label: 'Open Creator', to: '/creator' },
  },
  {
    title: 'Trust you can see',
    problem: 'Accounts get banned or hacked with no explanation and no way back.',
    answer: 'Account Status explains every moderation decision with a one-tap appeal. Recovery friends get you back in.',
    tryIt: { label: 'Set up recovery friends', to: '/settings/account' },
  },
  {
    title: 'Your data is yours',
    problem: 'Surveillance advertising pays for the big platforms.',
    answer: 'No tracking ads, ever. Sponsored posts match the topic you are reading, not a profile of you. Export or delete everything.',
    tryIt: { label: 'See your data', to: '/settings/data' },
  },
];

export interface Comparison {
  need: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  zemvii: string;
}

export const COMPARISON: Comparison[] = [
  { need: 'See everything from people I follow', facebook: 'Mixed with suggestions', instagram: 'Algorithm hides followed accounts', tiktok: 'For You first', zemvii: 'Friends feed: complete, newest first' },
  { need: 'Control the ranking', facebook: 'Limited', instagram: 'Limited', tiktok: '"Not interested" only', zemvii: 'Feed Dials and presets' },
  { need: 'Know why a post is shown', facebook: 'Basic', instagram: 'Basic', tiktok: 'No', zemvii: 'The real formula, per post' },
  { need: 'Stop scrolling', facebook: 'Infinite', instagram: 'Infinite', tiktok: 'Infinite', zemvii: 'Caught-up screen, sets, time budget' },
  { need: 'Avoid AI slop', facebook: 'Inconsistent labels', instagram: 'Inconsistent labels', tiktok: 'Labels with false positives', zemvii: 'Origin label on every post, one-switch filter' },
  { need: 'Creator earnings', facebook: 'Ad share', instagram: 'Varies', tiktok: 'Fund pay declining', zemvii: '90% of tips and memberships' },
  { need: 'Get my account back', facebook: 'Notoriously hard', instagram: 'Hard', tiktok: 'Hard', zemvii: 'Recovery friends vouch for you' },
  { need: 'Advertising', facebook: 'Behavioural tracking', instagram: 'Behavioural tracking', tiktok: 'Behavioural tracking', zemvii: 'Contextual only, never in Friends' },
];
