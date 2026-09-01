// Spaced repetition: a Leitner box ladder with an SM-2 style ease factor.
// One record per exercise item; concept/unit mastery is derived from those records.

import { today, addDays, daysBetween, clamp } from './util.js';

export const MAX_BOX = 7;
// days until an item comes back, indexed by box (box 0 = same day)
export const INTERVALS = [0, 1, 2, 4, 9, 18, 35, 70];

export const LEVELS = ['New', 'Learning', 'Familiar', 'Strong', 'Mastered'];

export function newRecord() {
  return { box: 0, ease: 2.5, due: today(), last: null, seen: 0, right: 0, wrong: 0, lapses: 0, streak: 0 };
}

/** Apply an answer to a record. Returns the mutated record. */
export function grade(rec, correct, firstTry = true) {
  const r = rec ?? newRecord();
  r.seen += 1;
  r.last = today();

  if (correct) {
    r.right += 1;
    r.streak += 1;
    r.ease = clamp(r.ease + (firstTry ? 0.06 : -0.05), 1.3, 2.8);
    r.box = Math.min(r.box + 1, MAX_BOX);
    const base = INTERVALS[r.box];
    const days = r.box <= 1 ? base : Math.max(base, Math.round(base * (r.ease / 2.5)));
    r.due = addDays(today(), days);
  } else {
    r.wrong += 1;
    r.streak = 0;
    if (r.box > 0) r.lapses += 1;
    r.ease = clamp(r.ease - 0.2, 1.3, 2.8);
    r.box = r.box >= 3 ? 1 : 0;
    r.due = today(); // comes back in this session, and again tomorrow
  }
  return r;
}

export const isDue = (rec, day = today()) => !!rec && daysBetween(rec.due, day) >= 0;
export const isNew = (rec) => !rec || rec.seen === 0;
export const overdueDays = (rec, day = today()) => (rec ? Math.max(0, daysBetween(rec.due, day)) : 0);

/** 0..1 strength of a single item. */
export function itemMastery(rec) {
  if (!rec || rec.seen === 0) return 0;
  const boxPart = rec.box / MAX_BOX;
  const acc = rec.right / Math.max(1, rec.seen);
  return clamp(boxPart * 0.75 + acc * 0.25, 0, 1);
}

/** 0..1 strength of a group of items given the progress map. */
export function groupMastery(items, records) {
  if (!items.length) return 0;
  let sum = 0;
  for (const it of items) sum += itemMastery(records[it.id]);
  return sum / items.length;
}

export function masteryLevel(m, seenAny) {
  if (!seenAny || m <= 0) return 0;
  if (m < 0.3) return 1;
  if (m < 0.55) return 2;
  if (m < 0.8) return 3;
  return 4;
}

/** Higher = more worth revisiting. Used for the "needs attention" list. */
export function weakness(items, records) {
  let score = 0;
  let seen = 0;
  for (const it of items) {
    const r = records[it.id];
    if (!r || r.seen === 0) continue;
    seen += 1;
    const acc = r.right / r.seen;
    score += (1 - acc) * 2.2 + r.lapses * 0.9 + Math.min(overdueDays(r), 21) * 0.14 + (1 - r.box / MAX_BOX) * 0.7;
  }
  if (!seen) return 0;
  return score / seen;
}

export function stats(items, records) {
  let due = 0, fresh = 0, seen = 0, right = 0, answered = 0;
  const day = today();
  for (const it of items) {
    const r = records[it.id];
    if (!r || r.seen === 0) { fresh += 1; continue; }
    seen += 1;
    answered += r.seen;
    right += r.right;
    if (isDue(r, day)) due += 1;
  }
  return {
    total: items.length,
    due, new: fresh, seen,
    accuracy: answered ? right / answered : 0,
    mastery: groupMastery(items, records),
  };
}
