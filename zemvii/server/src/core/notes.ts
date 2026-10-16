// Community notes: context added by readers, shown once enough people rate
// it helpful. (A production version uses a bridging algorithm that requires
// agreement between people who usually disagree.)

export const NOTE_MIN_HELPFUL = 3;
export const NOTE_MIN_RATIO = 0.7;

export function noteIsShown(helpful: number, notHelpful: number): boolean {
  const total = helpful + notHelpful;
  return helpful >= NOTE_MIN_HELPFUL && total > 0 && helpful / total >= NOTE_MIN_RATIO;
}
