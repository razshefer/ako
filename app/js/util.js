// Small DOM / date / text helpers. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- tiny markdown subset: `code`, **bold**, *italic*, - bullets ---------- */
export function md(src) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  const blocks = String(src ?? '').split(/\n{2,}/);
  return blocks
    .map((b) => {
      const lines = b.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return '';
      if (lines.every((l) => /^\s*-\s+/.test(l))) {
        return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>';
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/** Same as md() but without the wrapping <p>, for text that sits inside a line. */
export function mdInline(src) {
  return md(src).replace(/^<p>/, '').replace(/<\/p>$/, '');
}

/* ---------- naive syntax tint for yaml / bash / logs ---------- */
export function codeBlock(code, lang = 'text', label = null, note = null) {
  const raw = esc(code);
  let out = raw;
  if (lang === 'yaml' || lang === 'json') {
    out = raw
      .replace(/^(\s*#.*)$/gm, '<span class="cmt">$1</span>')
      .replace(/^(\s*-?\s*)([\w.\-\/]+)(:)/gm, '$1<span class="key">$2</span>$3')
      .replace(/(:\s+)(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '$1<span class="str">$2</span>')
      .replace(/(:\s+)(\d+(?:\.\d+)?[a-zA-Z%]*)$/gm, '$1<span class="num">$2</span>');
  } else if (lang === 'bash' || lang === 'sh') {
    out = raw
      .replace(/^(\s*#.*)$/gm, '<span class="cmt">$1</span>')
      .replace(/^(\$ )/gm, '<span class="pr">$1</span>');
  } else if (lang === 'log') {
    out = raw
      .replace(/\b(E\d{4}|ERROR|FATAL|Failed|failed|Error)\b/g, '<span class="num">$1</span>')
      .replace(/^(\s*#.*)$/gm, '<span class="cmt">$1</span>');
  }
  const head = label ? `<div class="code-label">${esc(label)}</div>` : '';
  const foot = note ? `<div class="code-note">${md(note)}</div>` : '';
  return `${head}<pre class="code">${out}</pre>${foot}`;
}

/* ---------- dates (local-time day keys) ---------- */
export function dayKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dayKey(dt);
}
export function daysBetween(a, b) {
  const p = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  return Math.round((p(b) - p(a)) / 86400000);
}
export function today() { return dayKey(); }
export function relDay(key) {
  const diff = daysBetween(today(), key);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  return `in ${diff}d`;
}

/* ---------- misc ---------- */
export function pct(n) { return Math.round(n * 100); }
export function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function shuffle(arr, seed) {
  // no seed = a genuinely different order every call, so answer positions
  // can never be memorized instead of the answers
  const a = arr.slice();
  let s = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeAnswer(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*=\s*/g, '=')
    .trim()
    .replace(/[.;]+$/, '');
}

let toastTimer = null;
export function toast(msg) {
  const old = $('.toast');
  if (old) old.remove();
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2200);
}

export function haptic(ms = 12) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignore */ } }
}
