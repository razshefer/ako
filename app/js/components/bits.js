import { esc, clamp, pct } from '../util.js';
import { LEVELS } from '../srs.js';

export function ring(value, max, top, bottom) {
  const r = 34, c = 2 * Math.PI * r;
  const frac = clamp(max ? value / max : 0, 0, 1);
  return `<div class="ring">
    <svg width="84" height="84" viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="8"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${frac >= 1 ? 'var(--good)' : 'var(--accent)'}"
        stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/>
    </svg>
    <div class="ring-label">${esc(top)}<small>${esc(bottom)}</small></div>
  </div>`;
}

export const levelDot = (lvl) => `<span class="dot m${lvl}" title="${LEVELS[lvl]}"></span>`;
export const levelName = (lvl) => LEVELS[lvl];

export function bar(frac, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${pct(clamp(frac, 0, 1))}%"></i></div>`;
}

export function stat(value, label) {
  return `<div class="stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`;
}
