// Age rules. The birth date is used only to apply protections; it is never
// shown on profiles. Production adds a privacy-preserving age-assurance
// provider (no ID documents stored) as required in Australia and the EU.

import { ADULT_AGE, MIN_AGE } from './defaults.ts';

export function ageOn(birthDate: string, now: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return NaN;
  const today = new Date(now);
  let age = today.getUTCFullYear() - Number(match[1]);
  const monthDiff = today.getUTCMonth() + 1 - Number(match[2]);
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < Number(match[3]))) age--;
  return age;
}

export function isTeen(birthDate: string, now: number): boolean {
  const age = ageOn(birthDate, now);
  return Number.isFinite(age) && age < ADULT_AGE;
}

/** Returns an error message, or null when the birth date is acceptable. */
export function validateBirthDate(birthDate: unknown, now: number, minAge = MIN_AGE): string | null {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 'Enter your birth date.';
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate) return 'Enter a real date.';
  const age = ageOn(birthDate, now);
  if (age < minAge) return `You need to be at least ${minAge} to use Zemvii.`;
  if (age > 120) return 'Enter a real date.';
  return null;
}
