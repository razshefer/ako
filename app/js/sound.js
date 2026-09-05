// Synthesized feedback sounds. No audio files, no network — every cue is
// generated with oscillators at play time, which keeps the app offline-native
// and lets the sounds be tuned in code rather than re-exported.
//
// Design rules that make these tolerable on the hundredth session rather than
// just the first:
//   - short (most under 300ms) and quiet (master gain is deliberately low)
//   - rising intervals for good news, falling for bad, never harsh
//   - being wrong is not punished, it is noted; a scolding buzzer makes people
//     stop opening the app
//
// Note frequencies, for reading the cues below:
//   A3 220  F3 175   C5 523  E5 659  G5 784  A5 880
//   C6 1047 E6 1319  G6 1568 A6 1760 C7 2093 E7 2637

import { state } from './store.js';

const MASTER = 0.16;          // everything is scaled by this; phone speakers are shouty
let ctx = null;
let unlocked = false;

/** Browsers require a gesture before audio can start. Unlock on the first tap. */
export function installSoundUnlock() {
  const unlock = () => {
    ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    unlocked = true;
  };
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });
}

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

export const soundEnabled = () => state.settings.sound !== false;

/**
 * One note with an attack/decay envelope.
 * `at` is an offset in seconds from now, which is how the multi-note cues are
 * sequenced without timers — the audio clock is far steadier than setTimeout.
 */
function note(freq, { at = 0, dur = 0.16, gain = 1, type = 'sine', slideTo = null } = {}) {
  const c = ensureContext();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);

  const peak = Math.max(0.0001, MASTER * gain);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);       // fast but not clicky
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/* ---------------- the palette ---------------- */

const CUES = {
  // a rising perfect fifth: the sound of a door opening
  correct: () => {
    note(1047, { dur: 0.10, gain: 0.9, type: 'triangle' });
    note(1568, { at: 0.085, dur: 0.20, gain: 0.8, type: 'triangle' });
  },

  // same shape, quieter — for an item you got right on the second look
  correctAgain: () => {
    note(784, { dur: 0.09, gain: 0.55, type: 'triangle' });
    note(1047, { at: 0.075, dur: 0.16, gain: 0.5, type: 'triangle' });
  },

  // a falling minor third, low and soft. Disappointment, not punishment.
  wrong: () => {
    note(220, { dur: 0.13, gain: 0.85, type: 'square' });
    note(175, { at: 0.10, dur: 0.22, gain: 0.7, type: 'square' });
  },

  // in a walkthrough, predicting wrong is the point — this is a shrug, not a buzz
  predictWrong: () => {
    note(392, { dur: 0.14, gain: 0.5, type: 'sine' });
    note(330, { at: 0.11, dur: 0.20, gain: 0.42, type: 'sine' });
  },

  // major arpeggio: a session finished
  complete: () => {
    note(1047, { dur: 0.12, gain: 0.75, type: 'triangle' });
    note(1319, { at: 0.10, dur: 0.12, gain: 0.75, type: 'triangle' });
    note(1568, { at: 0.20, dur: 0.30, gain: 0.8, type: 'triangle' });
  },

  // the big one: the streak advanced. Longer, with a shimmer on top.
  streak: () => {
    note(1047, { dur: 0.13, gain: 0.8, type: 'triangle' });
    note(1319, { at: 0.11, dur: 0.13, gain: 0.8, type: 'triangle' });
    note(1568, { at: 0.22, dur: 0.14, gain: 0.85, type: 'triangle' });
    note(2093, { at: 0.34, dur: 0.45, gain: 0.9, type: 'triangle' });
    note(2637, { at: 0.40, dur: 0.55, gain: 0.25, type: 'sine' });
  },

  // daily goal met, on a day the streak was already safe
  goal: () => {
    note(1319, { dur: 0.11, gain: 0.7, type: 'triangle' });
    note(1760, { at: 0.09, dur: 0.28, gain: 0.7, type: 'triangle' });
  },

  // a concept crossed into Mastered — warm rather than bright
  mastered: () => {
    note(784, { dur: 0.13, gain: 0.6, type: 'sine' });
    note(1047, { at: 0.11, dur: 0.13, gain: 0.6, type: 'sine' });
    note(1319, { at: 0.22, dur: 0.34, gain: 0.65, type: 'sine' });
  },

  // a unit opened up
  unlock: () => note(440, { dur: 0.30, gain: 0.55, type: 'sine', slideTo: 1174 }),

  // a walkthrough step revealed: barely there, just a page turn
  reveal: () => note(660, { dur: 0.07, gain: 0.22, type: 'sine' }),

  // selecting an answer. Off by default — pleasant once, wearing by session ten.
  tap: () => note(1200, { dur: 0.03, gain: 0.18, type: 'sine' }),
};

export const CUE_NAMES = Object.keys(CUES);

/** Play a cue by name. Silent if sounds are off or audio is unavailable. */
export function play(name) {
  if (!soundEnabled()) return;
  if (name === 'tap' && !state.settings.tapSound) return;
  const cue = CUES[name];
  if (!cue) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { cue(); } catch { /* audio is a nicety; never let it break a session */ }
}

/** Preview a cue from Settings even when sounds are switched off. */
export function preview(name) {
  const cue = CUES[name];
  if (!cue) return;
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { cue(); } catch { /* ignore */ }
}

export const audioAvailable = () => !!(window.AudioContext || window.webkitAudioContext);
export const audioUnlocked = () => unlocked && !!ctx && ctx.state === 'running';
