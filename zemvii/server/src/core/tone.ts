// The tone check behind "Pause & rethink" and the Calm dial.
//
// It is a transparent, rule-based classifier (no data leaves the platform and
// every decision can be explained). It separates:
//   * insults aimed at a person ("you're pathetic")  -> hurtful: nudge first
//   * venting about things ("this traffic is stupid") -> heated: no nudge
//   * threats and telling people to self-harm         -> threat: blocked
//   * someone describing their own crisis             -> self_harm: allowed,
//     and the writer is shown support resources instead of a scolding
// Production would add a learned model behind the same interface.

export type ToneLevel = 'ok' | 'heated' | 'hurtful' | 'threat' | 'self_harm';

export interface ToneResult {
  level: ToneLevel;
  /** 0 (calm) – 1 (very heated). Stored on posts for the Calm dial. */
  heat: number;
  /** Plain-language reasons, shown in the nudge. */
  reasons: string[];
  /** The words that triggered the result. */
  matches: string[];
  suggestion: string | null;
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** Lower-case, undo common character swaps, and collapse repeated letters ("stuuupid" -> "stupid"). */
export function normalizeForTone(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')) out += LEET[ch] ?? ch;
  return out.replace(/(\p{L})\1+/gu, '$1').replace(/[’`]/g, "'");
}

function collapse(word: string): string {
  return word.replace(/(\p{L})\1+/gu, '$1');
}

const INSULTS = [
  'idiot', 'idiots', 'stupid', 'moron', 'morons', 'dumb', 'dumbass', 'loser', 'losers', 'pathetic', 'worthless',
  'ugly', 'disgusting', 'trash', 'garbage', 'clown', 'freak', 'imbecile', 'jerk', 'creep', 'useless', 'brainless',
  'scum', 'lowlife', 'cretin', 'dimwit', 'halfwit', 'airhead', 'parasite', 'subhuman',
].map(collapse);

const INSULT_PHRASES = [
  'shut up', 'nobody cares', 'no one cares', 'no one asked', 'nobody asked', 'get lost', 'you suck', 'u suck',
  'hate you', 'grow a brain', 'get a life', 'waste of space', 'waste of air',
].map(collapse);

const PROFANITY = [/\bf+u+c+k\w*/, /\bsh[i]+t\w*/, /\bbitch\w*/, /\bashole\w*/, /\bbastard\w*/, /\bcrap\b/, /\bdamn\b/, /\bwtf\b/];

const THREATS = [
  /\b(i'?m|i am|im)\s+(going to|gona|gonna)\s+(kil|hurt|beat|stab|shot|shoot|find|destroy)\s+(you|u|ya)\b/,
  /\b(i'?l|i wil|we'?l|we wil)\s+(kil|hurt|beat|stab|shot|shoot|find|destroy)\s+(you|u|ya)\b/,
  /\b(kil|hang|shot)\s+yourself\b/,
  /\bkys\b/,
  /\bi know where (you|u) live\b/,
  /\b(you|u) (should|deserve to) die\b/,
  /\b(hope|wish) (you|u) die\b/,
  /\b(you|u)'?re (going to die|gona die)\b/,
];

const SELF_HARM = [
  /\b(kil|hurt|harm)\s+myself\b/,
  /\bsuicid\w*/,
  /\bself[- ]?harm\w*/,
  /\b(want|wanna|going) to (die|end it all|end my life|disappear forever)\b/,
  /\bdon'?t want to (live|be alive|be here anymore|exist)\b/,
  /\bend(ing)? my life\b/,
];

const OUTRAGE = [
  'outrage', 'outrageous', 'disgrace', 'furious', 'insane', 'unbelievable', 'slams', 'destroyed', 'destroys',
  'horrible', 'worst', 'hate', 'hated', 'evil', 'shameful', 'disaster', 'ridiculous', 'scandal', 'enraged', 'idiotic',
].map(collapse);

const WARM = ['thanks', 'thank', 'love', 'apreciate', 'congrats', 'congratulations', 'beautiful', 'amazing', 'proud', 'kind', 'wonderful', 'sory', 'please'].map(collapse);
const WARM_EMOJI = /[❤💛💚💙💜🧡🤍🙏😊🥰🤗✨🎉]/u;

const SECOND_PERSON = new Set(['you', 'your', "you're", 'youre', 'yours', 'u', 'ur', 'ya', 'yourself', "you've", "you'll", 'thou']);

export const SUPPORT_MESSAGE =
  "It sounds like you might be going through something really hard. You're not alone. " +
  'If you are in danger, please contact local emergency services, or reach out to a crisis line such as 988 (US) or findahelpline.com.';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function checkTone(input: string): ToneResult {
  const text = normalizeForTone(input);
  const tokens = text.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const matches: string[] = [];
  const reasons: string[] = [];
  let heat = 0;

  for (const pattern of THREATS) {
    const m = text.match(pattern);
    if (m) {
      return {
        level: 'threat',
        heat: 1,
        reasons: ['This reads as a threat or as telling someone to hurt themselves.'],
        matches: [m[0]],
        suggestion: "Threats aren't allowed on Zemvii. If you're angry, it's okay to step away and come back later.",
      };
    }
  }

  let selfHarm = false;
  for (const pattern of SELF_HARM) {
    const m = text.match(pattern);
    if (m) {
      selfHarm = true;
      matches.push(m[0]);
    }
  }

  const phrases = INSULT_PHRASES.filter((p) => new RegExp(`(^|[^\\p{L}])${p}([^\\p{L}]|$)`, 'u').test(text));
  const profane = PROFANITY.map((p) => text.match(p)?.[0]).filter((m): m is string => Boolean(m));
  const secondPerson = tokens.flatMap((t, i) => (SECOND_PERSON.has(t) ? [i] : []));
  const directed = secondPerson.length > 0;
  // An insult counts as aimed at someone when it sits within three words of "you"/"your".
  const nearYou = (index: number) => secondPerson.some((j) => Math.abs(index - j) <= 3);
  const insultIndexes = tokens.flatMap((t, i) => (INSULTS.includes(collapse(t)) ? [i] : []));
  const aimed = insultIndexes.some(nearYou);
  const insults = insultIndexes.map((i) => tokens[i]);
  const outrage = tokens.filter((t) => OUTRAGE.includes(collapse(t)));
  const warm = tokens.filter((t) => WARM.includes(collapse(t))).length + (WARM_EMOJI.test(input) ? 1 : 0);

  if (insults.length) {
    matches.push(...insults);
    heat += aimed ? 0.55 + 0.15 * (insults.length - 1) : 0.15;
    reasons.push(aimed ? 'Calls someone a name.' : 'Uses insulting words.');
  }
  if (phrases.length) {
    matches.push(...phrases);
    heat += 0.45;
    reasons.push('Dismisses or shuts someone down.');
  }
  if (profane.length) {
    matches.push(...profane);
    heat += directed ? 0.35 : 0.2;
    reasons.push('Strong language.');
  }
  if (outrage.length) {
    heat += Math.min(0.4, 0.12 * outrage.length);
    reasons.push('Outrage words.');
  }
  const letters = input.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
    heat += 0.2;
    reasons.push('ALL CAPS reads as shouting.');
  }
  if (/[!?]{3,}/.test(input)) heat += 0.1;
  heat -= Math.min(0.3, 0.12 * warm);
  heat = clamp01(Math.round(heat * 100) / 100);

  const hurtful = aimed || phrases.length > 0 || (profane.length > 0 && directed && heat >= 0.5);

  if (selfHarm) {
    return { level: 'self_harm', heat, reasons: ['Mentions self-harm.'], matches, suggestion: SUPPORT_MESSAGE };
  }
  if (hurtful) {
    return {
      level: 'hurtful',
      heat: Math.max(heat, 0.7),
      reasons,
      matches,
      suggestion: 'This might land as hurtful. Disagreeing is fine; try speaking to the idea, not the person.',
    };
  }
  if (heat >= 0.35) {
    return { level: 'heated', heat, reasons, matches, suggestion: 'Strong words. Want to take a breath before posting?' };
  }
  return { level: 'ok', heat, reasons: [], matches: [], suggestion: null };
}
