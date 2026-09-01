// Tap-to-define terms.
//
// Terms live in content/glossary.json. After rendering explanatory text we walk
// its text nodes and wrap known terms in a button that opens a small sheet with
// a one-line definition. Code blocks, links and buttons are left alone.

import { el, esc, md } from './util.js';

const URL_GLOSSARY = new URL('../../content/glossary.json', import.meta.url);

/** Containers whose text gets terms linked. Everything else is left as-is. */
const GLOSSIFY_SELECTOR = '.brief, .explain, .q-prompt, .code-note, .flow-body, .flow-note, .glossify';
const SKIP_ANCESTORS = 'code, pre, a, button, .gloss, .no-gloss, .chip, .code-label';

export const glossary = { terms: {}, aliases: {}, ready: false };
let matcher = null;

export async function loadGlossary() {
  try {
    const res = await fetch(URL_GLOSSARY, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    glossary.terms = data.terms || {};
    glossary.aliases = data.aliases || {};
    buildMatcher();
    glossary.ready = true;
  } catch (e) {
    console.warn('[glossary] not loaded, term definitions disabled:', e.message);
  }
  return glossary;
}

/** canonical key for a surface form, or null */
export function resolve(surface) {
  if (glossary.terms[surface]) return surface;
  if (glossary.aliases[surface]) return glossary.aliases[surface];
  const lower = surface.toLowerCase();
  for (const k of Object.keys(glossary.terms)) if (k.toLowerCase() === lower) return k;
  for (const a of Object.keys(glossary.aliases)) if (a.toLowerCase() === lower) return glossary.aliases[a];
  return null;
}

export const define = (key) => glossary.terms[resolve(key) ?? ''] || null;

function buildMatcher() {
  const surfaces = [
    ...Object.keys(glossary.terms).filter((k) => glossary.terms[k].auto !== false),
    ...Object.keys(glossary.aliases),
  ].sort((a, b) => b.length - a.length);
  if (!surfaces.length) return;
  const escaped = surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  matcher = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');
}

/** A capitalized term only matches with its own capitalization ("Service" != "service"). */
function acceptableCase(surface, matched) {
  if (!/[A-Z]/.test(surface)) return true;
  return surface === matched;
}

function surfaceFor(matched) {
  if (glossary.terms[matched] || glossary.aliases[matched]) return matched;
  const lower = matched.toLowerCase();
  for (const k of Object.keys(glossary.terms)) if (k.toLowerCase() === lower) return k;
  for (const a of Object.keys(glossary.aliases)) if (a.toLowerCase() === lower) return a;
  return null;
}

/**
 * Wrap known terms inside `root` in tappable buttons.
 * Only the first mention of each term is linked, so a paragraph does not
 * turn into a wall of links.
 */
export function linkGlossary(root, seen = new Set()) {
  if (!matcher || !root) return;
  if (root.dataset.glossed === '1') return;   // never link the same block twice
  root.dataset.glossed = '1';

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest(SKIP_ANCESTORS)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);

  for (const node of targets) {
    const text = node.nodeValue;
    matcher.lastIndex = 0;
    let m;
    let cursor = 0;
    let frag = null;

    while ((m = matcher.exec(text)) !== null) {
      const matched = m[0];
      const surface = surfaceFor(matched);
      if (!surface || !acceptableCase(surface, matched)) continue;

      // do not break hyphenated identifiers we did not match in full
      const before = text[m.index - 1];
      const after = text[m.index + matched.length];
      if (before === '-' || after === '-') continue;

      const key = resolve(surface);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      frag = frag || document.createDocumentFragment();
      frag.appendChild(document.createTextNode(text.slice(cursor, m.index)));
      const btn = el(`<button class="gloss" type="button">${esc(matched)}</button>`);
      btn.dataset.term = key;
      btn.title = glossary.terms[key].short;
      frag.appendChild(btn);
      cursor = m.index + matched.length;
    }

    if (frag) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
      node.parentNode.replaceChild(frag, node);
    }
  }
}

/** Link terms in every explanatory container found under `root`. */
export function glossify(root) {
  if (!matcher || !root) return;
  root.querySelectorAll(GLOSSIFY_SELECTOR).forEach((n) => linkGlossary(n));
}

/* ---------------- the definition sheet ---------------- */

let openSheet = null;

// A screen can take over "read the full concept" so it does not lose its place.
// A running session sets this on entry and clears it on exit.
let conceptOpener = null;
export function setConceptOpener(fn) { conceptOpener = fn; }

export function closeTermSheet() {
  if (!openSheet) return;
  openSheet.remove();
  openSheet = null;
  document.removeEventListener('keydown', onEsc, true);
}

function onEsc(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeTermSheet(); }
}

export function showTerm(key) {
  const entry = glossary.terms[key];
  if (!entry) return;
  closeTermSheet();

  const wrap = el(`<div class="sheet-wrap">
    <div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-label="${esc(key)}">
      <div class="sheet-grip"></div>
      <div class="sheet-term">${esc(key)}</div>
      <div class="sheet-def">${md(entry.short)}</div>
      <div class="sheet-actions"></div>
    </div>
  </div>`);

  const actions = wrap.querySelector('.sheet-actions');
  if (entry.concept) {
    const open = el('<button class="btn secondary sm" type="button">Read the full concept</button>');
    open.onclick = () => {
      closeTermSheet();
      if (conceptOpener) conceptOpener(entry.concept);
      else location.hash = `#/concept/${encodeURIComponent(entry.concept)}`;
    };
    actions.appendChild(open);
  }
  const dismiss = el('<button class="btn ghost sm" type="button">Got it</button>');
  dismiss.onclick = closeTermSheet;
  actions.appendChild(dismiss);

  wrap.querySelector('.sheet-backdrop').onclick = closeTermSheet;
  document.body.appendChild(wrap);
  openSheet = wrap;
  document.addEventListener('keydown', onEsc, true);
}

/** One delegated listener for the whole app. */
export function installGlossaryHandler() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.gloss');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    showTerm(btn.dataset.term);
  });
}
