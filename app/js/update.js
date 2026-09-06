// Service worker lifecycle: register it, notice when a newer one takes over,
// and be able to say which build is actually running.
//
// The shell is cached cache-first, so an installed phone runs whatever it
// cached until a *different* `sw.js` arrives. That made "is it updated?"
// unanswerable from the device, which is the question this module exists to
// answer — and to stop having to ask.

import { toast } from './util.js';

const sw = () => ('serviceWorker' in navigator ? navigator.serviceWorker : null);

let reg = null;
let build = null;       // VERSION of the worker controlling this page
let pending = false;    // a newer worker has taken over; this page is stale

export const runningBuild = () => build;
export const updatePending = () => pending;

export function installUpdates() {
  const api = sw();
  if (!api || !location.protocol.startsWith('http')) return;

  // Whether this page was already controlled decides what a controller swap
  // means: with no previous controller it is the first install (nothing was
  // replaced), with one it is a genuine update and the loaded code is stale.
  const hadController = !!api.controller;

  api.addEventListener('controllerchange', () => {
    askBuild();
    if (!hadController) return;
    pending = true;
    // Deliberately not reloading. A reload here would throw away a session
    // mid-question; the new code is served on the next launch anyway.
    toast('Update ready — reopen Ako to use it');
  });

  api.register(new URL('../../sw.js', import.meta.url))
    .then((r) => { reg = r; askBuild(); })
    .catch(() => {});

  // Coming back to the app is the natural moment to look for a new build;
  // a long-lived installed PWA may otherwise not navigate for days.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

/** Ask the registration to re-fetch sw.js. Resolves when the check is done. */
export function checkForUpdate() {
  if (!reg) return Promise.resolve(false);
  return reg.update().then(() => true).catch(() => false);
}

/** The controlling worker reports its own VERSION over a message channel. */
function askBuild() {
  const api = sw();
  const controller = api && api.controller;
  if (!controller) { build = null; return; }
  try {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => { build = e.data?.version || null; };
    controller.postMessage({ type: 'version' }, [ch.port2]);
  } catch { /* older browser, no channel messaging */ }
}
