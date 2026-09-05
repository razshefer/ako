import { el, esc, md, codeBlock, pct, relDay } from '../util.js';
import { content, itemsOfUnit, itemsOfPack } from '../content.js';
import { state, setActivePack, flowState } from '../store.js';
import { stats, masteryLevel, isNew, retrievability, stabilityDays, LEVELS } from '../srs.js';
import { bar, levelDot } from '../components/bits.js';
import { icons } from '../components/icons.js';
import { flowRow } from './home.js';

function shell(title, backHash) {
  const wrap = el(`<div class="fade">
    <div class="topbar">
      ${backHash ? `<button class="iconbtn" type="button">${icons.back}</button>` : ''}
      <h1>${esc(title)}</h1>
    </div>
    <div class="screen"></div>
  </div>`);
  const b = wrap.querySelector('.iconbtn');
  if (b) b.onclick = () => { location.hash = backHash; };
  return wrap;
}

/* ---------------- all packs ---------------- */
export function renderLibrary(root) {
  const wrap = shell('Library', null);
  const screen = wrap.querySelector('.screen');

  screen.appendChild(el(`<div class="card">
    <div class="tiny" style="margin-bottom:8px">What this is</div>
    <div class="small muted">
      Reference, not homework. Practice already teaches you each concept the first
      time it comes up — browse here when you want the full write-up, or to drill
      one specific thing.
    </div>
  </div>`));

  if (!content.packs.length) {
    screen.appendChild(el('<div class="empty"><div class="big">📦</div>No packs installed.</div>'));
  }

  content.packs.forEach((p) => {
    const items = itemsOfPack(p.id);
    const st = stats(items, state.records);
    const active = state.activePack === p.id;
    const card = el(`<div class="card">
      <div class="row between">
        <div class="row" style="gap:10px">
          <span style="font-size:24px">${esc(p.emoji)}</span>
          <div class="col">
            <h3 style="font-size:16px">${esc(p.title)}</h3>
            <span class="small faint">${esc(p.subtitle || '')}</span>
          </div>
        </div>
        ${active ? '<span class="chip accent">active</span>' : ''}
      </div>
      <div style="margin-top:12px">${bar(st.recall, 'good')}</div>
      <div class="row small faint" style="gap:10px;margin-top:8px">
        <span>${p.units.length} units</span><span>${items.length} exercises</span>
        <span>${pct(st.recall)}% recall</span>
      </div>
      <div class="btn-row" style="margin-top:12px"></div>
    </div>`);
    const row = card.querySelector('.btn-row');
    const open = el('<button class="btn secondary" type="button">Open</button>');
    open.onclick = () => { location.hash = `#/library/${encodeURIComponent(p.id)}`; };
    row.appendChild(open);
    if (!active) {
      const use = el('<button class="btn" type="button">Make active</button>');
      use.onclick = () => { setActivePack(p.id); location.hash = '#/'; };
      row.appendChild(use);
    } else {
      const drill = el('<button class="btn" type="button">Practice</button>');
      drill.onclick = () => { location.hash = `#/session?mode=daily&pack=${encodeURIComponent(p.id)}`; };
      row.appendChild(drill);
    }
    screen.appendChild(card);
  });

  if (content.problems.length) {
    screen.appendChild(el(`<div class="card">
      <div class="tiny" style="margin-bottom:6px">Content warnings (${content.problems.length})</div>
      <pre class="code">${esc(content.problems.slice(0, 20).join('\n'))}</pre>
    </div>`));
  }

  root.appendChild(wrap);
}

/* ---------------- one pack ---------------- */
export function renderPack(root, packId) {
  const pack = content.byPack.get(packId);
  if (!pack) return root.appendChild(el('<div class="empty">Pack not found.</div>'));
  const wrap = shell(pack.title, '#/library');
  const screen = wrap.querySelector('.screen');

  if (pack.description) {
    screen.appendChild(el(`<div class="card"><div class="brief small">${md(pack.description)}</div></div>`));
  }

  if (pack.flows.length) {
    const flows = el(`<div class="card">
      <div class="row between" style="margin-bottom:4px">
        <div class="tiny">Walkthroughs</div>
        <div class="tiny">${pack.flows.filter((f) => flowState(f.id)?.completed).length}/${pack.flows.length}</div>
      </div>
      <div class="small faint" style="margin-bottom:6px">
        Follow one real sequence end to end. Best place to start on a new area.
      </div>
    </div>`);
    pack.flows.forEach((f) => flows.appendChild(flowRow(f)));
    screen.appendChild(flows);
    screen.appendChild(el('<div class="tiny" style="margin:18px 0 8px">Units — the drill material</div>'));
  }

  pack.units.forEach((u, i) => {
    const items = itemsOfUnit(u.id);
    const ust = stats(items, state.records);
    const m = ust.recall;
    const seen = ust.seen;
    const card = el(`<button class="card" type="button" style="display:block;width:100%;text-align:left;cursor:pointer">
      <div class="row between">
        <div class="row" style="gap:10px">
          <span class="num" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
                background:var(--card-2);border:1px solid var(--line);font-weight:800;font-size:13px;color:var(--fg-dim)">${i + 1}</span>
          <h3 style="font-size:15px">${esc(u.title)}</h3>
        </div>
        ${levelDot(masteryLevel(m, seen > 0))}
      </div>
      <div class="small faint" style="margin:8px 0 10px">${esc(u.summary || '')}</div>
      ${bar(m, m >= 0.8 ? 'good' : '')}
      <div class="row small faint" style="gap:10px;margin-top:8px">
        <span>${u.concepts.length} concepts</span><span>${seen}/${items.length} seen</span>
      </div>
    </button>`);
    card.onclick = () => { location.hash = `#/unit/${encodeURIComponent(u.id)}`; };
    screen.appendChild(card);
  });

  root.appendChild(wrap);
}

/* ---------------- one unit ---------------- */
export function renderUnit(root, unitId) {
  const unit = content.byUnit.get(unitId);
  if (!unit) return root.appendChild(el('<div class="empty">Unit not found.</div>'));
  const items = itemsOfUnit(unit.id);
  const st = stats(items, state.records);
  const wrap = shell(unit.title, `#/library/${encodeURIComponent(unit.packId)}`);
  const screen = wrap.querySelector('.screen');

  screen.appendChild(el(`<div class="card">
    <div class="brief small muted">${md(unit.summary || '')}</div>
    <div style="margin-top:12px">${bar(st.recall, st.recall >= 0.75 ? 'good' : '')}</div>
    <div class="row small faint" style="gap:10px;margin-top:8px">
      <span>${pct(st.recall)}% recall</span><span>${st.due} due</span><span>${st.new} not seen</span>
    </div>
  </div>`));

  const drill = el('<button class="btn" type="button">Practice this unit</button>');
  drill.onclick = () => { location.hash = `#/session?mode=unit&unit=${encodeURIComponent(unit.id)}`; };
  screen.appendChild(drill);

  const list = el('<div class="card" style="margin-top:14px"><div class="tiny" style="margin-bottom:4px">Concepts</div></div>');
  unit.concepts.forEach((c) => {
    const cst = stats(c.items, state.records);
    const m = cst.recall;
    const seen = cst.seen > 0;
    const row = el(`<button class="listrow" type="button">
      ${levelDot(masteryLevel(m, seen))}
      <span class="grow">
        <span class="title ellips">${esc(c.title)}</span>
        <span class="sub">${c.items.length} exercises · ${seen ? LEVELS[masteryLevel(m, seen)] : 'not started'}</span>
      </span>
      <span class="chev">${icons.chev}</span>
    </button>`);
    row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(c.id)}`; };
    list.appendChild(row);
  });
  screen.appendChild(list);

  root.appendChild(wrap);
}

/* ---------------- one concept ---------------- */
export function renderConcept(root, conceptId) {
  const c = content.byConcept.get(conceptId);
  if (!c) return root.appendChild(el('<div class="empty">Concept not found.</div>'));
  const unit = content.byUnit.get(c.unitId);
  const st = stats(c.items, state.records);
  const seen = c.items.some((i) => !isNew(state.records[i.id]));
  const wrap = shell(c.title, `#/unit/${encodeURIComponent(c.unitId)}`);
  const screen = wrap.querySelector('.screen');

  screen.appendChild(el(`<div class="row wrap" style="gap:8px;margin-bottom:12px">
    <span class="chip">${esc(unit?.title || '')}</span>
    <span class="chip ${st.recall >= 0.75 ? 'good' : seen ? '' : 'accent'}">${LEVELS[masteryLevel(st.recall, seen)]}</span>
    ${st.due ? `<span class="chip bad">${st.due} due</span>` : ''}
  </div>`));

  screen.appendChild(el(`<div class="card"><div class="brief">${md(c.brief)}</div></div>`));

  if (c.examples?.length) {
    const ex = el('<div class="card"><div class="tiny">Examples</div></div>');
    c.examples.forEach((e) => {
      ex.appendChild(el(`<div>${codeBlock(e.code, e.lang || 'yaml', e.label || null, e.note || null)}</div>`));
    });
    screen.appendChild(ex);
  }

  const drill = el('<button class="btn" type="button">Practice this concept</button>');
  drill.onclick = () => { location.hash = `#/session?mode=concept&concept=${encodeURIComponent(c.id)}`; };
  screen.appendChild(drill);

  /* per-exercise recall state */
  const detail = el('<div class="card" style="margin-top:14px"><div class="tiny" style="margin-bottom:4px">Recall state</div></div>');
  c.items.forEach((it) => {
    const r = state.records[it.id];
    const m = retrievability(r);
    const days = stabilityDays(r);
    const label = !r || r.seen === 0
      ? 'not seen yet'
      : `${pct(m)}% recall · good for ~${days < 1 ? '<1' : Math.round(days)}d · `
        + `${r.right}/${r.seen} right · due ${relDay(r.due)}`;
    detail.appendChild(el(`<div class="listrow" style="cursor:default">
      <span class="dot m${masteryLevel(m, !!r && r.seen > 0)}"></span>
      <span class="grow">
        <span class="title small ellips">${esc(String(it.prompt).replace(/[`*]/g, '').slice(0, 60))}</span>
        <span class="sub">${esc(label)}</span>
      </span>
      <span class="chip">${esc(it.type)}</span>
    </div>`));
  });
  screen.appendChild(detail);

  if (c.links?.length) {
    const links = el('<div class="card"><div class="tiny" style="margin-bottom:6px">Further reading</div></div>');
    c.links.forEach((l) => {
      links.appendChild(el(`<div style="padding:6px 0"><a href="${esc(l.url)}" target="_blank" rel="noreferrer noopener">${esc(l.label)} ↗</a></div>`));
    });
    screen.appendChild(links);
  }

  root.appendChild(wrap);
}
