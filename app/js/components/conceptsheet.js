// A full-height overlay showing a concept without leaving the current screen.
//
// Used from inside a running session and from a walkthrough: reading the
// explanation must never cost you your place.

import { el, esc, md, codeBlock } from '../util.js';
import { content } from '../content.js';
import { glossify, closeTermSheet } from '../glossary.js';
import { icons } from '../components/icons.js';

let current = null;

export function closeConceptSheet() {
  if (!current) return;
  current.remove();
  current = null;
  document.removeEventListener('keydown', onEsc, true);
}

function onEsc(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeConceptSheet(); }
}

/** Open concept `conceptId` over whatever is on screen. Returns true if shown. */
export function conceptSheet(conceptId, { backLabel = 'Back' } = {}) {
  const c = content.byConcept.get(conceptId);
  if (!c) return false;
  closeTermSheet();
  closeConceptSheet();

  const unit = content.byUnit.get(c.unitId);
  const wrap = el(`<div class="overlay">
    <div class="overlay-top">
      <button class="iconbtn" type="button" aria-label="${esc(backLabel)}">${icons.back}</button>
      <div class="grow ellips" style="font-weight:700">${esc(c.title)}</div>
      <button class="iconbtn overlay-close" type="button" aria-label="Close">${icons.close}</button>
    </div>
    <div class="overlay-body">
      <div class="row wrap" style="gap:8px;margin-bottom:12px">
        <span class="chip">${esc(unit?.title || '')}</span>
      </div>
      <div class="card"><div class="brief">${md(c.brief)}</div></div>
      ${(c.examples || []).length ? `<div class="card">
        <div class="tiny">Examples</div>
        ${(c.examples || []).map((e) => codeBlock(e.code, e.lang || 'yaml', e.label || null, e.note || null)).join('')}
      </div>` : ''}
      ${(c.links || []).length ? `<div class="card">
        <div class="tiny" style="margin-bottom:6px">Further reading</div>
        ${(c.links || []).map((l) => `<div style="padding:6px 0"><a href="${esc(l.url)}" target="_blank" rel="noreferrer noopener">${esc(l.label)} ↗</a></div>`).join('')}
      </div>` : ''}
    </div>
    <div class="overlay-foot">
      <button class="btn" type="button">${esc(backLabel)}</button>
    </div>
  </div>`);

  wrap.querySelector('.iconbtn').onclick = closeConceptSheet;
  wrap.querySelector('.overlay-close').onclick = closeConceptSheet;
  wrap.querySelector('.overlay-foot .btn').onclick = closeConceptSheet;

  document.body.appendChild(wrap);
  current = wrap;
  glossify(wrap.querySelector('.overlay-body'));
  document.addEventListener('keydown', onEsc, true);
  return true;
}
