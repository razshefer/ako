// Builds a practice queue and tracks a run through it.

import { content, itemsOfUnit, itemsOfPack } from './content.js';
import { state, answer as recordAnswer, addSessionTime } from './store.js';
import { isDue, isNew, overdueDays, itemMastery, groupMastery } from './srs.js';
import { shuffle } from './util.js';

/** A unit is available once the previous one has been meaningfully started. */
export function unitUnlocked(unit) {
  if (!state.settings.linearPath) return true;
  if (unit.index === 0) return true;
  const pack = content.byPack.get(unit.packId);
  const prev = pack.units[unit.index - 1];
  const items = itemsOfUnit(prev.id);
  if (!items.length) return true;
  const seen = items.filter((i) => !isNew(state.records[i.id])).length;
  return seen / items.length >= 0.7;
}

export function unlockedUnits(packId) {
  const pack = content.byPack.get(packId);
  if (!pack) return [];
  return pack.units.filter(unitUnlocked);
}

/** The unit the user is currently working through. */
export function currentUnit(packId) {
  const pack = content.byPack.get(packId);
  if (!pack) return null;
  for (const u of pack.units) {
    const items = itemsOfUnit(u.id);
    if (!items.length) continue;
    const m = groupMastery(items, state.records);
    const allSeen = items.every((i) => !isNew(state.records[i.id]));
    if (!allSeen || m < 0.8) return u;
  }
  return pack.units[pack.units.length - 1] || null;
}

function dueItems(pool) {
  return pool
    .filter((i) => !isNew(state.records[i.id]) && isDue(state.records[i.id]))
    .sort((a, b) => {
      const ra = state.records[a.id], rb = state.records[b.id];
      return overdueDays(rb) - overdueDays(ra) || ra.box - rb.box;
    });
}

function newItems(pool) {
  return pool.filter((i) => isNew(state.records[i.id]));
}

/**
 * mode: 'daily' | 'unit' | 'concept' | 'weak' | 'pack'
 * Returns an ordered array of items.
 */
export function buildQueue(opts = {}) {
  const { mode = 'daily', packId = state.activePack, unitId = null, conceptId = null } = opts;
  const size = opts.size ?? state.settings.sessionLength;
  const newCap = opts.newCap ?? state.settings.newPerSession;

  if (mode === 'concept') {
    const c = content.byConcept.get(conceptId);
    return c ? shuffle(c.items) : [];
  }

  if (mode === 'unit') {
    // Practicing a unit on purpose: fill the whole session from that unit,
    // due reviews first, then new material, then the weakest of the rest.
    const pool = itemsOfUnit(unitId);
    const due = dueItems(pool);
    const fresh = newItems(pool);
    const rest = pool.filter((i) => !due.includes(i) && !fresh.includes(i))
      .sort((a, b) => itemMastery(state.records[a.id]) - itemMastery(state.records[b.id]));
    return interleave(due, fresh, rest).slice(0, size);
  }

  if (mode === 'weak') {
    const pool = (packId ? itemsOfPack(packId) : content.items)
      .filter((i) => !isNew(state.records[i.id]))
      .sort((a, b) => itemMastery(state.records[a.id]) - itemMastery(state.records[b.id]));
    return pool.slice(0, size);
  }

  // 'daily' / 'pack'
  const unlocked = mode === 'pack' ? (content.byPack.get(packId)?.units ?? []) : unlockedUnits(packId);
  const pool = unlocked.flatMap((u) => itemsOfUnit(u.id));
  const due = dueItems(pool);
  const fresh = [];
  for (const u of unlocked) {
    for (const i of itemsOfUnit(u.id)) {
      if (isNew(state.records[i.id])) fresh.push(i);
      if (fresh.length >= newCap) break;
    }
    if (fresh.length >= newCap) break;
  }
  const reviewSlots = Math.max(0, size - Math.min(fresh.length, newCap));
  const chosenDue = due.slice(0, reviewSlots);
  const chosenNew = fresh.slice(0, Math.max(0, size - chosenDue.length));

  let queue = interleave(chosenDue, chosenNew, []);
  if (queue.length < size) {
    // Not enough due reviews: top up with the weakest already-seen items...
    const weakest = pool
      .filter((i) => !queue.includes(i) && !isNew(state.records[i.id]))
      .sort((a, b) => itemMastery(state.records[a.id]) - itemMastery(state.records[b.id]))
      .slice(0, size - queue.length);
    queue = queue.concat(weakest);
  }
  if (queue.length < size) {
    // ...and only then with more new material, so early sessions are full length.
    const moreNew = [];
    for (const u of unlocked) {
      for (const i of itemsOfUnit(u.id)) {
        if (isNew(state.records[i.id]) && !queue.includes(i)) moreNew.push(i);
        if (queue.length + moreNew.length >= size) break;
      }
      if (queue.length + moreNew.length >= size) break;
    }
    queue = queue.concat(moreNew);
  }
  return queue.slice(0, size);
}

/** New items are spread through the queue rather than front-loaded. */
function interleave(due, fresh, rest) {
  const out = [];
  const d = shuffle(due).slice();
  const f = fresh.slice();
  const r = shuffle(rest).slice();
  const total = d.length + f.length + r.length;
  const every = f.length ? Math.max(2, Math.floor(total / (f.length + 1))) : Infinity;
  let n = 0;
  while (d.length || f.length || r.length) {
    if (f.length && (n % every === 1 || (!d.length && !r.length))) out.push(f.shift());
    else if (d.length) out.push(d.shift());
    else if (r.length) out.push(r.shift());
    else if (f.length) out.push(f.shift());
    n += 1;
  }
  return out;
}

/* ---------- run state ---------- */

export function createRun(items, meta = {}) {
  return {
    meta,
    queue: items.slice(),
    pos: 0,
    total: items.length,
    firstTryOf: new Map(),   // itemId -> bool
    retried: new Set(),
    right: 0,
    wrong: 0,
    startedAt: Date.now(),
    conceptsTouched: new Set(items.map((i) => i.conceptId)),

    get current() { return this.queue[this.pos] || null; },
    get done() { return this.pos >= this.queue.length; },
    get progress() { return this.queue.length ? this.pos / this.queue.length : 1; },

    submit(correct) {
      const item = this.current;
      if (!item) return { correct, requeued: false };
      const firstTry = !this.retried.has(item.id);
      if (firstTry) {
        this.firstTryOf.set(item.id, correct);
        if (correct) this.right += 1; else this.wrong += 1;
      }
      recordAnswer(item, correct, firstTry);

      let requeued = false;
      if (!correct && !this.retried.has(item.id)) {
        this.retried.add(item.id);
        this.queue.push(item);      // Duolingo-style: missed items come back
        requeued = true;
      }
      return { correct, requeued, firstTry };
    },

    next() { this.pos += 1; },

    finish() {
      const secs = (Date.now() - this.startedAt) / 1000;
      addSessionTime(Math.min(secs, 60 * 60));
      return {
        answered: this.firstTryOf.size,
        right: this.right,
        wrong: this.wrong,
        accuracy: this.firstTryOf.size ? this.right / this.firstTryOf.size : 0,
        seconds: Math.round(secs),
        concepts: [...this.conceptsTouched],
      };
    },
  };
}
