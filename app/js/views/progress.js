import { el, esc, pct, today, daysBetween, relDay } from '../util.js';
import { content, itemsOfUnit, itemsOfPack, allConcepts } from '../content.js';
import { state, streak, history, daysPracticed, flowState, setActivePack } from '../store.js';
import {
  stats, masteryLevel, weakness, isNew, isDue, isLeech,
  retrievability, groupStrength, stabilityDays, LEVELS,
} from '../srs.js';
import { bar, levelDot } from '../components/bits.js';
import { icons } from '../components/icons.js';

export function renderProgress(root) {
  const s = streak();
  const days = history(118);

  const wrap = el(`<div class="fade">
    <div class="topbar"><h1>Progress</h1></div>
    <div class="screen"></div>
  </div>`);
  const screen = wrap.querySelector('.screen');

  /* ---- headline: habit, not points ---- */
  const last7 = days.slice(-7);
  const ans7 = last7.reduce((a, d) => a + d.items, 0);
  const ok7 = last7.reduce((a, d) => a + d.correct, 0);

  screen.appendChild(el(`<div class="statgrid">
    <div class="stat"><b>${s.current}</b><span>day streak</span></div>
    <div class="stat"><b>${daysPracticed()}</b><span>days done</span></div>
    <div class="stat"><b>${ans7 ? pct(ok7 / ans7) + '%' : '—'}</b><span>7d accuracy</span></div>
  </div>`));

  /* ---- one card per subject, always all of them ---- */
  content.packs.forEach((p) => screen.appendChild(packCard(p)));

  /* ---- when the reviews land ---- */
  screen.appendChild(forecastCard());

  /* ---- what is slipping, across every subject ---- */
  screen.appendChild(attentionCard());

  /* ---- items that keep being forgotten ---- */
  const leechCard = leechesCard();
  if (leechCard) screen.appendChild(leechCard);

  /* ---- activity ---- */
  screen.appendChild(heatmapCard(days));

  root.appendChild(wrap);
}

/* ---------------- a subject ---------------- */

function packCard(p) {
  const items = itemsOfPack(p.id);
  const st = stats(items, state.records);
  const active = state.activePack === p.id;

  const card = el(`<div class="card">
    <div class="row between" style="margin-bottom:12px">
      <div class="row" style="gap:9px">
        <span style="font-size:19px">${esc(p.emoji)}</span>
        <h3 style="font-size:16px">${esc(p.title)}</h3>
      </div>
      ${active ? '<span class="chip accent">active</span>' : ''}
    </div>

    <div class="fluency">
      <div class="fluency-num">${pct(st.recall)}<span>%</span></div>
      <div class="fluency-say">
        <b>you can recall about this much of it right now</b>
        <span>${st.seen
          ? `${st.seen} of ${st.total} exercises met, holding ${pct(st.retention)}% of those`
          : 'nothing started yet'}</span>
      </div>
    </div>

    <div class="meter">
      <div class="meter-row">
        <span class="meter-label">Covered</span>
        ${bar(st.coverage)}
        <span class="meter-val">${pct(st.coverage)}%</span>
      </div>
      <div class="meter-row">
        <span class="meter-label">Retained</span>
        ${bar(st.retention, 'good')}
        <span class="meter-val">${pct(st.retention)}%</span>
      </div>
    </div>

    <div class="row wrap" style="gap:8px;margin-top:12px">
      ${st.due ? `<span class="chip bad">${st.due} to review</span>` : '<span class="chip good">nothing due</span>'}
      ${st.new ? `<span class="chip">${st.new} not seen</span>` : ''}
      ${st.leeches ? `<span class="chip gold">${st.leeches} keep slipping</span>` : ''}
    </div>
    <div class="hr"></div>
  </div>`);

  p.units.forEach((u) => {
    const uItems = itemsOfUnit(u.id);
    const ust = stats(uItems, state.records);
    const seenAny = ust.seen > 0;
    const row = el(`<button class="listrow" type="button">
      ${levelDot(masteryLevel(ust.recall, seenAny))}
      <span class="grow">
        <span class="title ellips">${esc(u.title)}</span>
        <span class="sub">${seenAny
          ? `${pct(ust.recall)}% recall · ${ust.seen}/${ust.total} met${ust.due ? ` · ${ust.due} due` : ''}`
          : 'not started'}</span>
        <span style="display:block;margin-top:6px">${bar(ust.recall, ust.recall >= 0.75 ? 'good' : '')}</span>
      </span>
      <span class="chev">${icons.chev}</span>
    </button>`);
    row.onclick = () => { location.hash = `#/unit/${encodeURIComponent(u.id)}`; };
    card.appendChild(row);
  });

  const row = el('<div class="btn-row" style="margin-top:14px"></div>');
  const drill = el(`<button class="btn ${st.due ? '' : 'secondary'}" type="button">${
    st.due ? `Review ${st.due}` : 'Practice'
  }</button>`);
  drill.onclick = () => {
    if (!active) setActivePack(p.id);
    location.hash = `#/session?mode=daily&pack=${encodeURIComponent(p.id)}`;
  };
  row.appendChild(drill);
  if (!active) {
    const use = el('<button class="btn secondary" type="button">Make active</button>');
    use.onclick = () => { setActivePack(p.id); window.dispatchEvent(new CustomEvent('ako:render')); };
    row.appendChild(use);
  }
  card.appendChild(row);
  return card;
}

/* ---------------- forecast ---------------- */

function forecastCard() {
  const forecast = new Array(8).fill(0);
  let overdue = 0;
  for (const it of content.items) {
    const r = state.records[it.id];
    if (isNew(r)) continue;
    const d = daysBetween(today(), r.due);
    if (d < 0) overdue += 1;
    else if (d <= 7) forecast[d] += 1;
  }
  const maxF = Math.max(1, ...forecast, overdue);
  return el(`<div class="card">
    <div class="tiny" style="margin-bottom:4px">When reviews come due</div>
    <div class="small faint" style="margin-bottom:10px">
      Each one is scheduled for roughly when you would otherwise start forgetting it.
    </div>
    <div class="row" style="align-items:flex-end;gap:6px;height:72px">
      ${forecast.map((n, i) => `
        <div class="grow" style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="font-size:11px;color:var(--fg-faint)">${n || ''}</div>
          <div style="width:100%;height:${Math.max(3, (n / maxF) * 46)}px;border-radius:4px;
               background:${i === 0 ? 'var(--accent)' : 'var(--line)'}"></div>
          <div style="font-size:10px;color:var(--fg-faint)">${i === 0 ? 'now' : '+' + i}</div>
        </div>`).join('')}
    </div>
    ${overdue ? `<div class="small muted" style="margin-top:8px">${overdue} overdue — included in "now".</div>` : ''}
  </div>`);
}

/* ---------------- weak spots ---------------- */

function attentionCard() {
  const ranked = allConcepts()
    .map((c) => {
      const st = stats(c.items, state.records);
      return { c, w: weakness(c.items, state.records), st };
    })
    .filter((x) => x.st.seen > 0 && x.w > 1.2)
    .sort((a, b) => b.w - a.w)
    .slice(0, 8);

  const card = el(`<div class="card">
    <div class="row between" style="margin-bottom:4px">
      <div class="tiny">Weakest right now</div>
      <div class="tiny">${ranked.length}</div>
    </div></div>`);

  if (!ranked.length) {
    card.appendChild(el(`<div class="small faint" style="padding:8px 0">
      Nothing flagged. This fills in once you have answered enough for the app to
      see a pattern.</div>`));
    return card;
  }

  ranked.forEach(({ c, st }) => {
    const pack = content.byPack.get(c.packId);
    const row = el(`<button class="listrow" type="button">
      ${levelDot(masteryLevel(st.recall, true))}
      <span class="grow">
        <span class="title ellips">${esc(c.title)}</span>
        <span class="sub">${content.packs.length > 1 ? `${esc(pack?.title || '')} · ` : ''}${
          pct(st.recall)}% recall · ${pct(st.accuracy)}% right${st.due ? ` · ${st.due} due` : ''}</span>
      </span>
      <span class="chev">${icons.chev}</span>
    </button>`);
    row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(c.id)}`; };
    card.appendChild(row);
  });

  const drill = el('<button class="btn secondary sm" style="width:100%;margin-top:12px" type="button">Drill the weakest</button>');
  drill.onclick = () => { location.hash = `#/session?mode=weak&pack=${encodeURIComponent(state.activePack || '')}`; };
  card.appendChild(drill);
  return card;
}

/* ---------------- leeches ---------------- */

function leechesCard() {
  const leeches = content.items
    .filter((it) => isLeech(state.records[it.id]))
    .sort((a, b) => state.records[b.id].lapses - state.records[a.id].lapses)
    .slice(0, 6);
  if (!leeches.length) return null;

  const card = el(`<div class="card">
    <div class="tiny" style="margin-bottom:4px">These keep slipping</div>
    <div class="small faint" style="margin-bottom:6px">
      Forgotten repeatedly. Usually a sign the underlying idea has not landed —
      reading the concept again beats drilling the question.
    </div></div>`);

  leeches.forEach((it) => {
    const r = state.records[it.id];
    const c = content.byConcept.get(it.conceptId);
    const row = el(`<button class="listrow" type="button">
      <span class="dot m1"></span>
      <span class="grow">
        <span class="title small ellips">${esc(String(it.prompt).replace(/[\`*]/g, '').slice(0, 58))}</span>
        <span class="sub">${esc(c?.title || '')} · forgotten ${r.lapses}×</span>
      </span>
      <span class="chev">${icons.chev}</span>
    </button>`);
    row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(it.conceptId)}`; };
    card.appendChild(row);
  });
  return card;
}

/* ---------------- activity ---------------- */

function heatmapCard(days) {
  const card = el(`<div class="card">
    <div class="row between" style="margin-bottom:10px">
      <div class="tiny">Daily activity</div>
      <div class="row small faint" style="gap:4px">
        less <span class="heat-cell"></span><span class="heat-cell l2"></span><span class="heat-cell l4"></span> more
      </div>
    </div>
    <div class="heat"></div>
  </div>`);
  const heatEl = card.querySelector('.heat');
  const padded = [];
  const [fy, fm, fd] = days[0].key.split('-').map(Number);
  for (let i = 0; i < new Date(fy, fm - 1, fd).getDay(); i++) padded.push(null);
  padded.push(...days);
  for (let i = 0; i < padded.length; i += 7) {
    const col = el('<div class="heat-col"></div>');
    padded.slice(i, i + 7).forEach((d) => {
      if (!d) { col.appendChild(el('<div class="heat-cell" style="opacity:.25"></div>')); return; }
      const c = el(`<div class="heat-cell l${d.level} ${d.key === today() ? 'today' : ''}"></div>`);
      c.title = `${d.key}: ${d.items} answered`;
      col.appendChild(c);
    });
    heatEl.appendChild(col);
  }
  setTimeout(() => { heatEl.scrollLeft = heatEl.scrollWidth; }, 0);
  return card;
}
