// The demo world: fictional people, posts, spaces and plans. Every person and
// brand here is made up. Times are relative to "now" so the demo always looks
// alive.

import type { Origin, PostKind } from '../store/types.ts';

export interface PersonaSpec {
  handle: string;
  name: string;
  pronouns: string;
  location: string;
  bio: string;
  hue: number;
  topics: string[];
  verified: boolean;
  birthDate: string;
  website?: string;
  supporters?: { priceCents: number; perks: string };
  role?: 'admin';
  brand?: boolean;
  /** Relative popularity, 0–1: how many people react to their posts. */
  reach: number;
}

export const PERSONAS: PersonaSpec[] = [
  { handle: 'maya', name: 'Maya Okafor', pronouns: 'she/her', location: 'Lisbon', hue: 165, topics: ['photography', 'hiking', 'travel'], verified: true, birthDate: '1993-05-14', reach: 0.9, website: 'mayaokafor.example', bio: 'Landscape photographer chasing first light. Organiser of Lisbon Trail Club. Prints and presets for supporters 💛', supporters: { priceCents: 400, perks: 'Monthly behind-the-scenes, RAW files and a print draw.' } },
  { handle: 'leo_martins', name: 'Leo Martins', pronouns: 'he/him', location: 'Lisbon', hue: 25, topics: ['coffee', 'fitness', 'food'], verified: true, birthDate: '1990-11-02', reach: 0.6, bio: 'Café owner. Bikes, beans and bad puns. Cupping nights every Thursday.' },
  { handle: 'priya', name: 'Priya Raman', pronouns: 'she/her', location: 'Porto', hue: 285, topics: ['design', 'art', 'books'], verified: true, birthDate: '1994-02-20', reach: 0.7, bio: 'Product designer. A sketchbook page every morning. Runs Sunday Sketchers ✏️' },
  { handle: 'samcooks', name: 'Sam Chen', pronouns: 'they/them', location: 'Lisbon', hue: 95, topics: ['food', 'gardening'], verified: true, birthDate: '1996-07-08', reach: 0.6, bio: 'Home cook, balcony gardener. Recipes that forgive you.' },
  { handle: 'aisha', name: 'Aisha Bello', pronouns: 'she/her', location: 'Coimbra', hue: 230, topics: ['science', 'books'], verified: true, birthDate: '1997-09-30', reach: 0.6, bio: 'Astrophysics PhD student. I point telescopes at things and then explain them badly 🔭' },
  { handle: 'diego', name: 'Diego Herrera', pronouns: 'he/him', location: 'Madrid', hue: 340, topics: ['music', 'film'], verified: true, birthDate: '1991-03-17', reach: 0.7, bio: "Songs about small towns. New EP 'Low Tide' out now.", supporters: { priceCents: 300, perks: 'Demos, lyric sheets and first listens.' } },
  { handle: 'noor', name: 'Noor Haddad', pronouns: 'she/her', location: 'Lisbon', hue: 140, topics: ['climate', 'gardening', 'local'], verified: true, birthDate: '1992-12-01', reach: 0.6, bio: 'Climate organiser. Community gardens > doomscrolling. Plant Swap Collective 🌱' },
  { handle: 'tomb', name: 'Tom Becker', pronouns: 'he/him', location: 'Berlin', hue: 40, topics: ['diy', 'parenting'], verified: true, birthDate: '1985-06-25', reach: 0.5, bio: 'Dad of two. Making furniture badly, then less badly.' },
  { handle: 'hana', name: 'Hana Sato', pronouns: 'she/her', location: 'Lisbon', hue: 190, topics: ['fitness', 'wellness'], verified: true, birthDate: '1995-04-11', reach: 0.6, bio: 'Yoga teacher and slow runner. Rest is training too 🧘' },
  { handle: 'kofi', name: 'Kofi Asante', pronouns: 'he/him', location: 'Accra', hue: 260, topics: ['gaming', 'tech', 'art'], verified: true, birthDate: '1994-08-19', reach: 0.6, bio: 'Indie game dev. Pixel art, chiptunes and one very long side project.' },
  { handle: 'elena', name: 'Elena Petrova', pronouns: 'she/her', location: 'Sofia', hue: 0, topics: ['film', 'books'], verified: true, birthDate: '1989-10-05', reach: 0.5, bio: 'Watching old films, reading new books. Book Nook host 📚' },
  { handle: 'mateo', name: 'Mateo Rossi', pronouns: 'he/him', location: 'Naples', hue: 200, topics: ['travel', 'photography', 'food'], verified: true, birthDate: '1992-01-28', reach: 0.8, bio: 'Travel clips without the drone noise. Slow trains, small towns.', supporters: { priceCents: 500, perks: 'Full-length slow travel films and route notes.' } },
  { handle: 'zara', name: 'Zara Ahmed', pronouns: 'she/her', location: 'London', hue: 320, topics: ['fashion', 'design', 'climate'], verified: true, birthDate: '1998-03-03', reach: 0.6, bio: 'Thrift flips and secondhand style. Buy-nothing-new challenge: month 10.' },
  { handle: 'benw', name: 'Ben Walker', pronouns: 'he/him', location: 'Dublin', hue: 50, topics: ['comedy'], verified: true, birthDate: '1988-12-12', reach: 0.7, bio: 'Comedian. Writes jokes on the bus, tests them on pigeons.' },
  { handle: 'lucia', name: 'Lucía Gómez', pronouns: 'she/her', location: 'Lisbon', hue: 30, topics: ['pets', 'local'], verified: true, birthDate: '1993-09-09', reach: 0.6, bio: 'Dog trainer. Positive reinforcement for dogs and for humans 🐾' },
  { handle: 'ravi', name: 'Ravi Kapoor', pronouns: 'he/him', location: 'Bengaluru', hue: 210, topics: ['tech', 'design'], verified: true, birthDate: '1987-05-21', reach: 0.6, bio: 'Building tools for small teams. I always label AI-assisted images.' },
  { handle: 'pixeldreams', name: 'Pixel Dreams', pronouns: '', location: 'Nowhere in particular', hue: 275, topics: ['art'], verified: false, birthDate: '1990-01-01', reach: 0.5, bio: 'Imaginary places made with AI, always labelled as AI-generated 🤖' },
  { handle: 'team_zemvii', name: 'Team Zemvii', pronouns: '', location: 'Everywhere', hue: 160, topics: ['tech'], verified: true, birthDate: '1990-01-01', reach: 0.8, role: 'admin', bio: 'Building the social network that works for you. Product notes and safety updates.' },
  { handle: 'trailhead_co', name: 'Trailhead Outfitters', pronouns: '', location: 'Porto', hue: 120, topics: ['hiking', 'travel'], verified: true, birthDate: '1990-01-01', reach: 0.2, brand: true, bio: 'Gear for slow adventures (a fictional demo brand). Our sponsored posts are always labelled.' },
  { handle: 'beanbloom', name: 'Bean & Bloom Coffee', pronouns: '', location: 'Lisbon', hue: 20, topics: ['coffee', 'food'], verified: true, birthDate: '1990-01-01', reach: 0.2, brand: true, bio: 'Small-batch roasters (a fictional demo brand).' },
  { handle: 'quickgains_44', name: 'Quick Gains', pronouns: '', location: '', hue: 60, topics: [], verified: false, birthDate: '1990-01-01', reach: 0, bio: 'DM me to 10x your money 🚀🚀' },
];

/** Persona handles that are friends with each other (mutual follows). Everyone not listed follows a few people. */
export const FRIEND_GROUPS: string[][] = [
  ['maya', 'leo_martins', 'hana', 'mateo', 'noor', 'lucia', 'samcooks'],
  ['priya', 'kofi', 'zara', 'elena', 'aisha', 'ravi'],
  ['diego', 'elena', 'benw', 'zara', 'mateo'],
  ['aisha', 'maya', 'kofi', 'tomb'],
  ['samcooks', 'noor', 'hana', 'lucia', 'tomb'],
];

export interface PostSpec {
  by: string;
  hoursAgo: number;
  text: string;
  scene?: string;
  seed?: number;
  kind?: PostKind;
  origin?: Origin;
  audience?: 'public' | 'followers' | 'friends' | 'supporters';
  space?: string;
  plan?: string;
  sponsored?: string;
  showCounts?: boolean;
  comments?: Array<[string, string]>;
  note?: { by: string; text: string; helpful: number; notHelpful: number };
  reports?: number;
  /** Extra reactions on top of the persona's reach. */
  boost?: number;
}

export const POSTS: PostSpec[] = [
  { by: 'maya', hoursAgo: 2, scene: 'mountains', seed: 11, boost: 0.3, text: 'First light over the ridge. Woke up at 4:40 for eleven minutes of this and would do it again tomorrow. #photography #hiking', comments: [['leo_martins', 'Worth every minute of lost sleep 😍'], ['priya', 'The colours! This is my new wallpaper.'], ['hana', 'Eleven minutes of magic.']] },
  { by: 'benw', hoursAgo: 2.5, text: "My smart speaker just said 'Sorry, I didn't catch that' and honestly, mate, me neither. #comedy", comments: [['tomb', 'My kids say this to me daily.'], ['zara', '😂😂']] },
  { by: 'hana', hoursAgo: 1, scene: 'lake', seed: 4, text: 'Rest day. Reminding myself that recovery is part of the plan, not a break from it. 🧘 #wellness' },
  { by: 'noor', hoursAgo: 3, scene: 'bloom', seed: 22, space: 'plant-swap-collective', text: 'Plant Swap this Saturday at Jardim da Estrela! Bring cuttings, take cuttings, leave with more plants than you can explain to your landlord 🌱 #gardening #local', comments: [['samcooks', 'Bringing three cuttings from the famous chilli plant.'], ['maya', 'Coming straight after the hike 🌿']] },
  { by: 'priya', hoursAgo: 3.5, scene: 'grid', seed: 7, space: 'sunday-sketchers', text: "My answer to this week's prompt: the laundromat sign that has been flickering since 2019. #art" },
  { by: 'quickgains_44', hoursAgo: 3.2, text: '🚀🚀 DM me to 10x your money in 7 days, GUARANTEED!!! Limited spots #money', reports: 3 },
  { by: 'leo_martins', hoursAgo: 4, scene: 'blobs', seed: 31, text: 'New single-origin in the grinder: a washed Ethiopian that tastes like apricot jam and smugness. #coffee', comments: [['samcooks', 'Apricot jam AND smugness? Sold.']] },
  { by: 'samcooks', hoursAgo: 5, scene: 'bloom', seed: 3, text: 'Tomato season is basically over, so this is a eulogy. Roasted with garlic, smashed on toast, eaten standing up. #food', comments: [['noor', 'A beautiful send-off.'], ['mateo', 'Nonna would approve.']] },
  { by: 'pixeldreams', hoursAgo: 5, scene: 'city', seed: 99, origin: 'ai_generated', text: 'An imaginary city that only exists at 3am. Made with AI 🤖 #art' },
  { by: 'priya', hoursAgo: 6, scene: 'city', seed: 18, text: 'Morning sketch: the tram stop outside my window. Twelve minutes, one pen, no undo. #art #design', comments: [['kofi', 'No undo is the bravest way to live.']] },
  { by: 'mateo', hoursAgo: 6, scene: 'ocean', seed: 41, kind: 'clip', text: 'Morning train along the coast. No drone, no music, just the window. #travel' },
  { by: 'aisha', hoursAgo: 7, scene: 'stars', seed: 5, boost: 0.2, text: 'Tonight from the observatory roof: Saturn is still doing the most. If you have binoculars, look south-east after 9pm. #science', comments: [['kofi', 'Saw it! Tiny but unmistakable.'], ['elena', 'This made my evening.']] },
  { by: 'lucia', hoursAgo: 8, scene: 'bloom', seed: 12, text: "This is Bolacha, 4 months old, learning 'wait'. She's very good at it for exactly two seconds 🐾 #pets", comments: [['hana', 'Two seconds is a personal best!']] },
  { by: 'diego', hoursAgo: 8, scene: 'aurora', seed: 15, kind: 'clip', text: 'Thirty seconds of the new chorus, recorded in a stairwell for the reverb. #music' },
  { by: 'maya', hoursAgo: 9, space: 'lisbon-trail-club', text: "Reminder for Sunday's Sintra walk: bring layers, the fog up there has opinions. A few spots left. #hiking" },
  { by: 'diego', hoursAgo: 10, scene: 'waves', seed: 8, text: "Wrote a song about the last bus home. It's in a minor key, because of course it is. Demo goes to supporters tonight. #music" },
  { by: 'zara', hoursAgo: 11, scene: 'blobs', seed: 27, text: "Thrift flip: men's blazer, two darts and a cropped hem. Total cost €9. #fashion", comments: [['priya', 'Those darts are perfect.']] },
  { by: 'tomb', hoursAgo: 12, scene: 'grid', seed: 2, text: "Built a bookshelf. It wobbles. My daughter says it 'has personality'. She will go far. #diy #parenting", comments: [['hana', 'Personality is underrated.'], ['leo_martins', 'Every good shelf has a lean.']] },
  { by: 'mateo', hoursAgo: 12, audience: 'supporters', scene: 'ocean', seed: 77, text: "Supporters' corner: the full 20-minute slow-train film is up 🚆 Thank you for funding the ticket." },
  { by: 'ravi', hoursAgo: 13, text: 'Shipped a feature where our app drafts a reply and a human approves it. The edit button gets used far more than the approve button, which is exactly right. #tech' },
  { by: 'kofi', hoursAgo: 14, scene: 'grid', seed: 61, text: 'Added rain to the game and now I just sit in the menu listening to it. Productivity is down 100%. #gaming #art', comments: [['benw', 'Ship the menu as the game.']] },
  { by: 'maya', hoursAgo: 15, scene: 'mountains', seed: 23, kind: 'clip', text: 'Ninety seconds of fog rolling through the valley. Sound on if you like wind. #hiking' },
  { by: 'elena', hoursAgo: 16, text: 'Rewatched an old black-and-white film tonight and remembered that silence is a special effect. #film' },
  { by: 'kofi', hoursAgo: 18, scene: 'waves', seed: 13, kind: 'clip', text: "Pixel waterfall loop, twelve frames. Took me longer than I'll admit. #art #gaming" },
  { by: 'pixeldreams', hoursAgo: 19, scene: 'aurora', seed: 101, kind: 'clip', origin: 'ai_generated', text: 'Dream loop #12, AI-generated. #art' },
  { by: 'team_zemvii', hoursAgo: 20, text: "Welcome to Zemvii 👋 Three things to try today: set your Feed Dials, put your people in Circles, and make a Plan. When you're done, you'll see \"You're all caught up\". That's on purpose.", boost: 0.3, comments: [['maya', 'The caught-up screen is my favourite feature, not even joking.'], ['diego', 'Circles changed how much I post. Way more, actually.']] },
  { by: 'maya', hoursAgo: 20, audience: 'supporters', scene: 'mountains', seed: 11, text: 'Supporters: the RAW file for the ridge shot is up, plus the before/after edit. Thank you for keeping this independent 💛' },
  { by: 'aisha', hoursAgo: 20, scene: 'stars', seed: 19, kind: 'clip', text: 'Time-lapse of the Milky Way rising over the dome: forty minutes in ten seconds. #science' },
  { by: 'hana', hoursAgo: 22, scene: 'ocean', seed: 9, text: 'Slow 8k along the river at sunrise. Not fast, not far, just nice. #fitness' },
  { by: 'pixeldreams', hoursAgo: 23, scene: 'desert', seed: 55, origin: 'ai_generated', text: 'A crystal desert, generated. Not a real place, sadly. #art' },
  { by: 'leo_martins', hoursAgo: 26, text: 'Rode 62 km this morning, then made 140 flat whites. My legs and my wrists are filing separate complaints. #fitness' },
  { by: 'mateo', hoursAgo: 27, scene: 'bloom', seed: 88, kind: 'clip', text: "Nonna's kitchen, Sunday, 11am. The sauce has been on since 8. #food #travel" },
  { by: 'samcooks', hoursAgo: 28, scene: 'forest', seed: 6, text: 'Balcony update: the chilli plant has produced exactly one chilli and I am treating it like a firstborn. #gardening' },
  { by: 'hana', hoursAgo: 30, scene: 'blobs', seed: 70, kind: 'clip', text: 'A four-minute stretch for people who sit all day (so, everyone). #wellness' },
  { by: 'maya', hoursAgo: 30, scene: 'lake', seed: 14, text: 'Shot this at the lake last week and only now got around to editing. Kept the colours honest. #photography' },
  { by: 'benw', hoursAgo: 33, scene: 'city', seed: 44, text: 'Told a joke to a pigeon. It walked away mid-punchline. Brutal crowd. #comedy' },
  { by: 'aisha', hoursAgo: 34, text: "Explaining my thesis to my nan: 'stars are big and far away and I count how they wobble'. She said 'that's nice dear' and honestly, same. #science", comments: [['elena', 'Your nan is a peer reviewer.']] },
  { by: 'mateo', hoursAgo: 36, scene: 'desert', seed: 33, text: 'Unpopular travel opinion: the best day of any trip is the one where you plan nothing. #travel' },
  { by: 'ravi', hoursAgo: 37, scene: 'grid', seed: 90, origin: 'ai_assisted', text: 'Mockup for a calmer notification centre. Image is AI-assisted: the layout is mine, a model did the render. #design #tech' },
  { by: 'priya', hoursAgo: 40, text: 'Design tip I keep relearning: if a button needs a tooltip to explain it, the button is the problem. #design' },
  { by: 'lucia', hoursAgo: 44, text: 'Training tip: reward the calm moments you usually ignore. Dogs (and people) repeat what gets noticed. #pets' },
  { by: 'noor', hoursAgo: 45, scene: 'forest', seed: 17, text: 'We planted 40 trees with the school this morning. The kids named every single one. There is now a tree called Lightning. #climate', boost: 0.2 },
  { by: 'pixeldreams', hoursAgo: 47, scene: 'aurora', seed: 66, origin: 'ai_generated', text: "Aurora over a sea that doesn't exist. AI-generated. #art" },
  { by: 'tomb', hoursAgo: 48, text: 'Woodworking lesson of the day: measure twice, cut once, then measure again because you measured the wrong board. #diy' },
  { by: 'leo_martins', hoursAgo: 50, text: 'Cupping night at the café on Thursday. Everyone welcome, no coffee snobbery allowed (except mine). #coffee #local' },
  { by: 'elena', hoursAgo: 52, scene: 'ocean', seed: 28, space: 'book-nook', text: "October pick: a slim novel about a lighthouse keeper. Discussion opens Friday, no spoilers before then! #books" },
  { by: 'mateo', hoursAgo: 54, scene: 'waves', seed: 47, kind: 'clip', text: 'Tiny ferry, big sea. #travel' },
  { by: 'diego', hoursAgo: 55, scene: 'city', seed: 52, text: 'Played to 23 people in a bookshop last night and it beat any big room. Small rooms are where songs grow up. #music' },
  { by: 'zara', hoursAgo: 58, text: "Month 10 of buying nothing new. Biggest lesson: I didn't need more clothes, I needed fewer, better outfits. #fashion #climate" },
  { by: 'samcooks', hoursAgo: 60, text: 'Recipe in the replies because three of you asked: one-pan lemon orzo. It forgives everything except burnt garlic. #food', comments: [['samcooks', 'Toast 1 cup orzo in butter, add 2.5 cups stock, simmer 10 min. Lemon zest and juice, a handful of spinach, more butter. Done.'], ['noor', 'Making this tonight!'], ['lucia', 'Bolacha approves of anything with butter.']] },
  { by: 'ravi', hoursAgo: 62, text: "We tested a deepfake detector this week: 100% accurate, never fooled once. Problem solved. #tech", note: { by: 'aisha', text: "Independent tests of deepfake detectors find they can be fooled, and that they also flag real images by mistake. Treat any detector's result as a signal to check, not as proof.", helpful: 14, notHelpful: 2 }, comments: [['kofi', 'Do you have the test set? I would love to try it.'], ['priya', 'Careful with absolutes though!']] },
  { by: 'kofi', hoursAgo: 65, space: 'indie-game-makers', text: 'Devlog #31: rewrote the save system for the third time. It finally survives the player closing the laptop mid-jump. #gaming' },
  { by: 'hana', hoursAgo: 70, scene: 'lake', seed: 38, plan: 'coast', text: 'Arrábida yesterday: 14 km, three swims, one lost hat. #hiking' },
  { by: 'maya', hoursAgo: 70, text: "Five things I've stopped doing on hikes: carrying a tripod I never use, racing the sunset, skipping breakfast, cotton socks, and checking my phone at the top. #hiking" },
  { by: 'mateo', hoursAgo: 71, scene: 'ocean', seed: 72, plan: 'coast', text: 'The water at Arrábida is a colour I did not know existed. #travel #hiking' },
  { by: 'noor', hoursAgo: 75, text: 'Small, boring, effective climate wins this month: the bakery switched to a heat pump, the school got bike racks, the council fixed the bus timetable. Celebrate the boring stuff. #climate' },
  { by: 'priya', hoursAgo: 80, space: 'sunday-sketchers', text: "This week's prompt: something you walk past every day and never really look at. Post yours here ✏️ #art" },
  { by: 'aisha', hoursAgo: 90, space: 'night-sky-watchers', text: 'Planning thread for the meteor watch: dark-sky spots within an hour of Lisbon? Cabo da Roca is my default. #science' },
  { by: 'team_zemvii', hoursAgo: 96, text: "Transparency note: every post's menu has \"Why am I seeing this?\". It shows the real ranking formula and your dials, not a vague guess. If it ever looks wrong, tell us." },
  { by: 'leo_martins', hoursAgo: 100, text: 'Hot take: the best cup of coffee is the one someone else made for you. #coffee' },
  { by: 'trailhead_co', hoursAgo: 30, scene: 'mountains', seed: 5, sponsored: 'Trailhead Outfitters', text: 'Rain shells built to be repaired, not replaced. Free repairs for life. #hiking #travel' },
  { by: 'beanbloom', hoursAgo: 40, scene: 'blobs', seed: 3, sponsored: 'Bean & Bloom Coffee', text: 'Compostable pods that actually compost in a home bin. #coffee #food' },
];

export interface SpaceSpec {
  slug: string;
  name: string;
  emoji: string;
  hue: number;
  owner: string;
  visibility: 'public' | 'private';
  description: string;
  topics: string[];
  location: string;
  rules: string[];
  members: string[];
}

export const SPACES: SpaceSpec[] = [
  { slug: 'lisbon-trail-club', name: 'Lisbon Trail Club', emoji: '🥾', hue: 150, owner: 'maya', visibility: 'public', topics: ['hiking', 'local'], location: 'Lisbon', description: 'Weekend walks around Lisbon for every pace. Routes, carpools and post-hike pastéis.', rules: ['Leave no trace.', 'The slowest walker sets the pace.', 'Share routes, never exact home locations.'], members: ['maya', 'leo_martins', 'hana', 'noor', 'mateo', 'lucia'] },
  { slug: 'sunday-sketchers', name: 'Sunday Sketchers', emoji: '✏️', hue: 285, owner: 'priya', visibility: 'public', topics: ['art', 'design'], location: 'Online', description: 'A weekly drawing prompt and zero pressure. All skill levels, all media.', rules: ['Critique only when asked.', 'Credit references.', 'Label AI-assisted work.'], members: ['priya', 'kofi', 'zara', 'elena'] },
  { slug: 'night-sky-watchers', name: 'Night Sky Watchers', emoji: '🔭', hue: 230, owner: 'aisha', visibility: 'public', topics: ['science'], location: 'Portugal', description: 'Meteor showers, planets and dark-sky trips. Binoculars welcome, telescopes optional.', rules: ['Red torches only at dark sites.', 'Share sky reports, not just photos.'], members: ['aisha', 'kofi', 'elena', 'maya'] },
  { slug: 'plant-swap-collective', name: 'Plant Swap Collective', emoji: '🌱', hue: 120, owner: 'noor', visibility: 'public', topics: ['gardening', 'local', 'climate'], location: 'Lisbon', description: 'Swap cuttings, seeds and advice. Monthly swaps in the park.', rules: ['No selling, only swapping.', 'Label your cuttings.'], members: ['noor', 'samcooks', 'hana', 'lucia'] },
  { slug: 'indie-game-makers', name: 'Indie Game Makers', emoji: '🎮', hue: 260, owner: 'kofi', visibility: 'public', topics: ['gaming', 'tech'], location: 'Online', description: 'Devlogs, playtests and moral support for small game teams.', rules: ['Give feedback you would want to get.', 'No key reselling.'], members: ['kofi', 'ravi', 'benw'] },
  { slug: 'book-nook', name: 'Book Nook', emoji: '📚', hue: 15, owner: 'elena', visibility: 'private', topics: ['books'], location: 'Online', description: 'A small, private book club. One slim book a month.', rules: ['Spoiler tags, always.'], members: ['elena', 'priya', 'aisha'] },
];

export interface PlanSpec {
  key: string;
  host: string;
  title: string;
  emoji: string;
  hue: number;
  /** Days from today, and local hour. */
  inDays: number;
  hour: number;
  hours: number;
  location: string;
  description: string;
  audience: 'public' | 'friends' | 'space';
  space?: string;
  capacity?: number;
  going: string[];
  maybe?: string[];
}

export const PLANS: PlanSpec[] = [
  { key: 'swap', host: 'noor', title: 'Plant Swap at Jardim da Estrela', emoji: '🌱', hue: 120, inDays: 1, hour: 10, hours: 3, location: 'Jardim da Estrela, Lisbon', audience: 'space', space: 'plant-swap-collective', description: 'Bring cuttings, seeds or pots. Take what you like. Coffee from the kiosk, chat optional.', going: ['noor', 'samcooks', 'lucia', 'hana'] },
  { key: 'hike', host: 'maya', title: 'Sintra ridge sunrise walk', emoji: '🥾', hue: 150, inDays: 2, hour: 6, hours: 5, location: 'Sintra station', audience: 'space', space: 'lisbon-trail-club', capacity: 12, description: 'Meet at Sintra station at 06:30. About 9 km and 450 m of climbing, back for brunch. Bring layers and water.', going: ['maya', 'leo_martins', 'hana', 'mateo'], maybe: ['lucia'] },
  { key: 'cupping', host: 'leo_martins', title: 'Cupping night at the café', emoji: '☕', hue: 25, inDays: 3, hour: 18, hours: 2, location: "Leo's café, Rua das Flores", audience: 'friends', capacity: 14, description: 'Six coffees, one spoon each, lots of slurping. Beginners very welcome.', going: ['leo_martins', 'maya', 'priya', 'samcooks'] },
  { key: 'meteor', host: 'aisha', title: 'Meteor watch at Cabo da Roca', emoji: '🌠', hue: 230, inDays: 4, hour: 22, hours: 3, location: 'Cabo da Roca car park', audience: 'space', space: 'night-sky-watchers', description: 'Blankets, thermos, red torches. We will point out what is up and count meteors.', going: ['aisha', 'kofi', 'maya'] },
  { key: 'sketch', host: 'priya', title: 'Sketch crawl: Alfama', emoji: '✏️', hue: 285, inDays: 5, hour: 15, hours: 3, location: 'Miradouro de Santa Luzia', audience: 'space', space: 'sunday-sketchers', description: 'Three stops, twenty minutes each, then pastries. Bring any sketchbook.', going: ['priya', 'zara'] },
  { key: 'gig', host: 'diego', title: 'Diego live at the bookshop', emoji: '🎸', hue: 340, inDays: 6, hour: 20, hours: 2, location: 'Livraria do Bairro', audience: 'public', capacity: 40, description: "Songs from 'Low Tide' plus two new ones. Small room, so RSVP if you're coming.", going: ['diego', 'elena', 'zara', 'benw', 'mateo'] },
  { key: 'coast', host: 'maya', title: 'Arrábida coast walk', emoji: '🌊', hue: 190, inDays: -3, hour: 8, hours: 7, location: 'Portinho da Arrábida', audience: 'space', space: 'lisbon-trail-club', description: 'Coastal trail with swim stops.', going: ['maya', 'hana', 'mateo', 'leo_martins'] },
];

/** Canned replies for the demo personas (they are not real people). */
export const REPLIES = {
  hello: ['Hey! 👋', 'Hi hi! Good to see you here.', 'Hello! Welcome in 😊'],
  plan: ["I'm in! 🙌", 'Count me in.', 'Yes! See you there.', 'Ooh, let me check my calendar… yes!'],
  thanks: ['Any time 💛', 'Of course!', 'Happy to help.'],
  question: ['Good question. I think yes?', "Hmm, I'd say go for it.", 'Honestly not sure, what do you think?'],
  photo: ['Love this 😍', 'Gorgeous!', 'Okay this is great.'],
  generic: ['Ha, love that 😄', 'Totally!', 'Oh nice, tell me more?', 'Haha same.', "That's the spirit 🙌", 'Agreed!'],
} as const;

export const PERSONA_FLAVOUR: Record<string, string[]> = {
  maya: ['Bring layers if you come on Sunday!', 'The light this week has been unreal.'],
  leo_martins: ['Coffee is on me next time ☕', 'Come by the café, I will save you a seat.'],
  samcooks: ['Have you tried it with extra lemon?', 'I will bring snacks.'],
  hana: ['Remember to drink water today 💧', 'Slow is still forward.'],
  priya: ['I might sketch that!', 'Love the details.'],
  noor: ['See you at the swap! 🌱', 'Small steps add up.'],
  aisha: ['The sky is clear tonight, look up!', 'Science says yes. Probably.'],
};

export const PERSONA_COMMENTS = [
  'Love this!', 'This made my day 💛', 'So good 😍', 'Welcome to Zemvii!', 'Yes!! More of this please.', 'Beautiful.',
  'Ha, brilliant.', 'Saving this one.',
];
