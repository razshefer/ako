// Scheduling built on a forgetting curve, in the family of SM-2 / Anki / FSRS.
//
// The model, in one line: every item has a **stability** — how many days until
// you would be about 90% likely to still recall it — and a **difficulty**, and
// reviews are timed to land just as recall starts to slip.
//
// Why this rather than the Leitner boxes this replaced:
//
//   - A box number cannot answer "do I know this *right now*". Stability plus
//     elapsed time can, and that is the number the progress screen needs.
//   - Boxes advance the same amount whether a review was easy or a struggle.
//     Here the gain depends on how far recall had already decayed — reviewing
//     something you nearly forgot teaches you more than drilling something
//     fresh — and on how difficult this item has proven for this person.
//   - Repeated failures on one item were invisible. Difficulty now ratchets up
//     and stays up, which is what makes a leech findable.
//
// Everything here is pure: records in, records out, no DOM and no storage.

import { today, addDays, daysBetween, clamp } from './util.js';

/** Recall probability we aim for at review time. Stability is defined against it. */
export const TARGET_RECALL = 0.9;

const MIN_STABILITY = 0.25;   // ~ same day
const MAX_STABILITY = 365;
const DEFAULT_DIFFICULTY = 0.3;
const LEECH_LAPSES = 6;       // "this one keeps slipping"

export const LEVELS = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];

export function newRecord() {
  return {
    s: 0,                     // stability in days; 0 until first answered
    d: DEFAULT_DIFFICULTY,    // 0..1, higher = harder for this person
    due: today(),
    last: null,
    seen: 0, right: 0, wrong: 0, lapses: 0, streak: 0,
  };
}

/* ---------------- the curve ---------------- */

/**
 * Probability of recalling this right now, 0..1.
 * R(t) = 0.9 ^ (t / s), so R is exactly 0.9 after `s` days — which is what
 * makes stability directly readable as "good for about this many days".
 */
export function retrievability(rec, day = today()) {
  if (!rec || rec.seen === 0 || !rec.last) return 0;
  const elapsed = Math.max(0, daysBetween(rec.last, day));
  const s = Math.max(rec.s, MIN_STABILITY);
  return clamp(Math.pow(TARGET_RECALL, elapsed / s), 0, 1);
}

/**
 * How durably this is known, independent of when it was last seen.
 * Stability of ~30 days reads as half-learned; a year is close to 1.
 */
export function strength(rec) {
  if (!rec || rec.seen === 0) return 0;
  const durable = rec.s / (rec.s + 30);
  return clamp(durable * (1 - 0.35 * rec.d), 0, 1);
}

/* ---------------- grading ---------------- */

/**
 * Apply one answer. Mutates and returns the record.
 *
 * `firstTry` is false for a within-session relearning attempt: those still
 * count, but they earn much less, because getting it right 30 seconds after
 * being told the answer is not evidence of durable memory.
 */
export function grade(rec, correct, { firstTry = true } = {}) {
  const r = rec ?? newRecord();
  const wasNew = r.seen === 0;
  const R = retrievability(r);

  r.seen += 1;
  r.last = today();

  if (correct) {
    r.right += 1;
    r.streak += 1;
    r.d = clamp(r.d - (firstTry ? 0.04 : 0.01), 0.05, 0.95);

    if (wasNew) {
      // a first sighting is worth about a day
      r.s = 1;
    } else if (!firstTry) {
      // relearned inside the session: nudge, do not reward
      r.s = clamp(Math.max(r.s, MIN_STABILITY) * 1.15, MIN_STABILITY, MAX_STABILITY);
    } else {
      // Three forces decide how far the next review moves out:
      //
      //   ease     — how hard this item has proven for this person
      //   spacing  — a bonus for reviewing late, when recall had already
      //              decayed; recalling something you nearly lost is worth
      //              more than drilling something still fresh
      //   taper    — diminishing returns, so intervals do not run away
      //
      // Multiplying rather than adding matters: an on-time review (R = 0.9)
      // still roughly doubles the interval, which is the normal case and has
      // to be worth something.
      const prev = Math.max(r.s, MIN_STABILITY);
      const ease = 2.6 - 1.4 * r.d;
      const spacing = 1 + 1.2 * (1 - R);
      const taper = Math.pow(1 + prev, -0.08);
      r.s = clamp(prev * clamp(ease * spacing * taper, 1.2, 5), MIN_STABILITY, MAX_STABILITY);
    }
  } else {
    r.wrong += 1;
    r.streak = 0;
    if (!wasNew) r.lapses += 1;
    r.d = clamp(r.d + 0.15, 0.05, 0.95);
    // Forgetting costs most of the interval, and is capped in absolute terms:
    // something you just failed should come back within days no matter how
    // long it had been holding. Difficult items fall further.
    r.s = wasNew
      ? MIN_STABILITY
      : clamp(Math.min(r.s * 0.25, 5) * (1 - 0.4 * r.d), MIN_STABILITY, MAX_STABILITY);
  }

  r.due = addDays(today(), Math.max(0, Math.round(r.s)));
  return r;
}

/* ---------------- queries ---------------- */

export const isNew = (rec) => !rec || rec.seen === 0;
export const isDue = (rec, day = today()) => !!rec && rec.seen > 0 && daysBetween(rec.due, day) >= 0;
export const overdueDays = (rec, day = today()) => (rec ? Math.max(0, daysBetween(rec.due, day)) : 0);
export const isLeech = (rec) => !!rec && rec.lapses >= LEECH_LAPSES;

/** Days of stability, for display. */
export const stabilityDays = (rec) => (rec && rec.seen ? Math.max(rec.s, 0) : 0);

/* ---------------- group measures ----------------
 *
 * Three different questions, deliberately kept apart, because collapsing them
 * into one "mastery %" is what made the old progress screen uninformative:
 *
 *   coverage  — how much of this have I ever met?
 *   retention — of what I have met, how much do I still hold right now?
 *   recall    — of the whole thing, how much can I produce today?
 *
 * recall is coverage x retention, and it is the honest headline number.
 */

export function coverage(items, records) {
  if (!items.length) return 0;
  let seen = 0;
  for (const it of items) if (!isNew(records[it.id])) seen += 1;
  return seen / items.length;
}

export function retention(items, records, day = today()) {
  let sum = 0, seen = 0;
  for (const it of items) {
    const r = records[it.id];
    if (isNew(r)) continue;
    seen += 1;
    sum += retrievability(r, day);
  }
  return seen ? sum / seen : 0;
}

export function recall(items, records, day = today()) {
  if (!items.length) return 0;
  let sum = 0;
  for (const it of items) sum += retrievability(records[it.id], day);
  return sum / items.length;
}

/** Mean durable strength — what the mastery bars show. */
export function groupStrength(items, records) {
  if (!items.length) return 0;
  let sum = 0;
  for (const it of items) sum += strength(records[it.id]);
  return sum / items.length;
}

export function masteryLevel(value, seenAny) {
  if (!seenAny || value <= 0) return 0;
  if (value < 0.25) return 1;
  if (value < 0.5) return 2;
  if (value < 0.75) return 3;
  return 4;
}

/**
 * Higher = more worth revisiting. Drives "needs another look".
 * Weighted toward things that are both fragile now and historically difficult,
 * so a hard item you reviewed yesterday still ranks above an easy one you have
 * not seen in a week.
 */
export function weakness(items, records, day = today()) {
  let score = 0, seen = 0;
  for (const it of items) {
    const r = records[it.id];
    if (isNew(r)) continue;
    seen += 1;
    const acc = r.right / Math.max(1, r.seen);
    score += (1 - retrievability(r, day)) * 1.6
           + r.d * 1.4
           + (1 - acc) * 1.2
           + Math.min(r.lapses, 8) * 0.35;
  }
  return seen ? score / seen : 0;
}

export function stats(items, records, day = today()) {
  let due = 0, fresh = 0, seen = 0, right = 0, answered = 0, leeches = 0;
  for (const it of items) {
    const r = records[it.id];
    if (isNew(r)) { fresh += 1; continue; }
    seen += 1;
    answered += r.seen;
    right += r.right;
    if (isDue(r, day)) due += 1;
    if (isLeech(r)) leeches += 1;
  }
  return {
    total: items.length,
    due, new: fresh, seen, leeches,
    accuracy: answered ? right / answered : 0,
    coverage: coverage(items, records),
    retention: retention(items, records, day),
    recall: recall(items, records, day),
    strength: groupStrength(items, records),
  };
}

/**
 * Convert a pre-forgetting-curve record (Leitner box + ease) in place.
 * Seeds stability from the old interval ladder so nobody loses their history.
 */
const OLD_INTERVALS = [0, 1, 2, 4, 9, 18, 35, 70];
export function migrateRecord(r) {
  if (!r || typeof r.s === 'number') return r;
  const box = clamp(Number(r.box) || 0, 0, 7);
  const acc = r.seen ? r.right / r.seen : 0.5;
  r.s = Math.max(MIN_STABILITY, OLD_INTERVALS[box] || MIN_STABILITY);
  r.d = clamp(DEFAULT_DIFFICULTY + (1 - acc) * 0.4 + Math.min(r.lapses || 0, 6) * 0.03, 0.05, 0.95);
  delete r.box;
  delete r.ease;
  return r;
}
