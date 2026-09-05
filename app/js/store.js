// Persistent state (localStorage) + a minimal subscribe/emit bus.

import { today, addDays, daysBetween } from './util.js';
import { grade, newRecord, migrateRecord } from './srs.js';

const KEY = 'ako.state.v1';
const SCHEMA = 1;

export const DEFAULT_SETTINGS = {
  dailyGoal: 12,        // items per day to keep the streak
  newPerSession: 5,     // cap on brand-new items introduced per session
  sessionLength: 12,    // items per session
  linearPath: true,     // gate units behind the previous one
  theme: 'dark',
  sound: true,          // feedback cues on answers, sessions and streaks
  tapSound: false,      // a click on every choice — fine once, wearing by session ten
};

function blank() {
  return {
    v: SCHEMA,
    settings: { ...DEFAULT_SETTINGS },
    activePack: null,
    records: {},         // itemId -> srs record
    days: {},            // 'YYYY-MM-DD' -> { items, correct, seconds }
    conceptSeen: {},     // conceptId -> 'YYYY-MM-DD' first time the brief was shown
    flows: {},           // flowId -> { completed, runs, lastScore }
    seenIntro: false,    // has the "how this works" card been dismissed
    streakCelebratedOn: null,  // 'YYYY-MM-DD' the streak screen was last shown
    createdAt: today(),
    lastOpen: today(),
  };
}

export const state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const base = blank();
    // records written before the forgetting-curve scheduler carry box/ease;
    // seed stability from the old ladder rather than resetting anyone's history
    for (const rec of Object.values(parsed.records || {})) migrateRecord(rec);
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      records: parsed.records || {},
      days: parsed.days || {},
      conceptSeen: parsed.conceptSeen || {},
      flows: parsed.flows || {},
    };
  } catch (e) {
    console.error('[store] could not read saved state, starting fresh', e);
    return blank();
  }
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      state.lastOpen = today();
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[store] save failed', e);
    }
  }, 120);
}

/* ---------- pub/sub ---------- */
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function emit() { for (const fn of subs) fn(state); }
function touch() { save(); emit(); }

/* ---------- settings ---------- */
export function setSetting(key, value) {
  state.settings[key] = value;
  if (key === 'theme') applyTheme();
  touch();
}
export function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === 'light' ? 'light' : 'dark';
}

export function setActivePack(packId) { state.activePack = packId; touch(); }

/* ---------- progress ---------- */
export const recordFor = (itemId) => state.records[itemId];

export function markConceptSeen(conceptId) {
  if (!state.conceptSeen[conceptId]) { state.conceptSeen[conceptId] = today(); save(); }
}

/**
 * Record one answer.
 * `firstTry` is false for a within-session relearning attempt — those earn far
 * less, because getting something right moments after being told the answer is
 * not evidence that it will still be there tomorrow.
 */
export function answer(item, correct, { firstTry = true } = {}) {
  const rec = state.records[item.id] || newRecord();
  grade(rec, correct, { firstTry });
  state.records[item.id] = rec;

  const k = today();
  const d = (state.days[k] ||= { items: 0, correct: 0, seconds: 0 });
  if (firstTry) {
    d.items += 1;
    if (correct) d.correct += 1;
  }
  touch();
  return rec;
}

/* ---------- walkthroughs ---------- */
export const flowState = (flowId) => state.flows[flowId] || null;

/** A prediction answered inside a walkthrough counts toward the daily goal. */
export function answerFlowStep(correct) {
  const d = (state.days[today()] ||= { items: 0, correct: 0, seconds: 0 });
  d.items += 1;
  if (correct) d.correct += 1;
  touch();
}

export function completeFlow(flowId, score) {
  const f = (state.flows[flowId] ||= { completed: null, runs: 0, lastScore: null });
  f.completed = today();
  f.runs += 1;
  f.lastScore = score;
  touch();
}

export function dismissIntro() { state.seenIntro = true; touch(); }

/* ---------- the streak moment ---------- */

/**
 * True on the first session of the day that reaches the goal. Checked at the
 * end of a session or a walkthrough, so the celebration never interrupts you
 * mid-question.
 */
export function streakCelebrationDue() {
  return goalMet() && state.streakCelebratedOn !== today();
}

export function markStreakCelebrated() {
  state.streakCelebratedOn = today();
  touch();
}

export function addSessionTime(seconds) {
  const d = (state.days[today()] ||= { items: 0, correct: 0, seconds: 0 });
  d.seconds += Math.round(seconds);
  save();
}

/* ---------- derived ---------- */
export const todayStats = () => state.days[today()] || { items: 0, correct: 0, seconds: 0 };
export const goalMet = (key = today()) => (state.days[key]?.items || 0) >= state.settings.dailyGoal;
/** Days on which the goal was met — a more honest "how much have I done" than XP. */
export const daysPracticed = () =>
  Object.values(state.days).filter((d) => (d.items || 0) >= state.settings.dailyGoal).length;

export function streak() {
  const goal = state.settings.dailyGoal;
  const done = (k) => (state.days[k]?.items || 0) >= goal;
  let cur = 0;
  let cursor = done(today()) ? today() : addDays(today(), -1);
  while (done(cursor)) { cur += 1; cursor = addDays(cursor, -1); }

  const keys = Object.keys(state.days).filter(done).sort();
  let longest = 0, run = 0, prev = null;
  for (const k of keys) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current: cur, longest: Math.max(longest, cur), goal };
}

/** [{key, items, correct, seconds, level}] for the last n days, oldest first. */
export function history(n = 119) {
  const out = [];
  for (let i = n; i >= 0; i--) {
    const key = addDays(today(), -i);
    const d = state.days[key];
    const items = d?.items || 0;
    const goal = state.settings.dailyGoal;
    const level = items === 0 ? 0 : items >= goal * 1.5 ? 4 : items >= goal ? 3 : items >= goal / 2 ? 2 : 1;
    out.push({ key, items, correct: d?.correct || 0, seconds: d?.seconds || 0, level });
  }
  return out;
}

/* ---------- backup ---------- */
export function exportJSON() { return JSON.stringify(state, null, 2); }

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.records) throw new Error('Not an Ako backup file.');
  const base = blank();
  for (const rec of Object.values(parsed.records || {})) migrateRecord(rec);
  Object.assign(state, base, parsed, {
    settings: { ...base.settings, ...(parsed.settings || {}) },
  });
  applyTheme();
  touch();
}

export function resetProgress() {
  const keep = { ...state.settings };
  Object.assign(state, blank(), { settings: keep });
  touch();
}
