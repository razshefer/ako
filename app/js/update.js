// Service worker lifecycle: register it, notice when a newer one takes over,
// and be able to say which build is actually running.
//
// The shell is cached cache-first, so an installed phone runs whatever it
// cached until a *different* `sw.js` arrives. That made "is it updated?"
// unanswerable from the device, which is the question this module exists to
// answer — and to stop having to ask.
//
// One rule throughout: never claim to know something this code cannot observe.
// The page knows which build is *running*; it does not know which build is
// newest, and it cannot tell "no update" from "could not reach the server".

import { toast } from './util.js';

const sw = () => ('serviceWorker' in navigator ? navigator.serviceWorker : null);

let reg = null;
let pending = false;      // a newer worker took over; this page's code is stale
let hadController = false;

/** True once a newer worker has claimed this page, so the loaded code is old. */
export const updatePending = () => pending;

export function installUpdates() {
  const api = sw();
  if (!api || !location.protocol.startsWith('http')) return;

  // Whether the page was already controlled decides what a controller swap
  // means: with no previous controller it is the first install and nothing was
  // replaced; with one it is a real update and the running code is now stale.
  hadController = !!api.controller;

  api.addEventListener('controllerchange', () => {
    if (hadController) {
      pending = true;
      // Deliberately not reloading. A reload here would throw away a session
      // mid-question; the new code is served on the next launch anyway.
      toast('Update installed — fully close and reopen Ako');
    }
    // From here on this page *is* controlled, so any further swap is an update.
    hadController = true;
  });

  api.register(new URL('../../sw.js', import.meta.url))
    .then((r) => { reg = r; })
    .catch(() => {});

  // Coming back to the app is the natural moment to look for a new build; an
  // installed PWA may otherwise not navigate for days.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

/**
 * Ask the registration to re-fetch sw.js.
 * Resolves true only if the check actually ran — false means it could not be
 * performed (offline, or no registration), which is not the same as "no update"
 * and must not be reported as one.
 */
export function checkForUpdate() {
  if (!reg) return Promise.resolve(false);
  return reg.update().then(() => true).catch(() => false);
}

/**
 * Which build is controlling this page.
 *
 *   { controlled: false }              nothing cached yet, or no worker here
 *   { controlled: true, build: null }  a worker that does not answer — i.e. one
 *                                      installed before this feature existed
 *   { controlled: true, build: 'ako-…' }
 *
 * The middle case is the interesting one: it is exactly what a phone stuck on
 * the old `ako-v1` worker looks like, and reporting nothing at all there would
 * leave the one screen meant to diagnose this saying nothing.
 */
export function currentBuild({ timeout = 1500 } = {}) {
  const api = sw();
  const controller = api && api.controller;
  if (!controller) return Promise.resolve({ controlled: false, build: null });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    setTimeout(() => finish({ controlled: true, build: null }), timeout);
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => finish({ controlled: true, build: e.data?.version || null });
      controller.postMessage({ type: 'version' }, [ch.port2]);
    } catch {
      finish({ controlled: true, build: null });   // no channel messaging here
    }
  });
}
