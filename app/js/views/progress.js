import { el, esc, pct, today, daysBetween } from '../util.js';
import { content, itemsOfUnit, itemsOfPack, allConcepts } from '../content.js';
import { state, streak, history, totalXP } from '../store.js';
import { stats, groupMastery, masteryLevel, weakness, isNew, isDue, LEVELS } from '../srs.js';
import { bar, levelDot } from '../components/bits.js';
import { icons } from '../components/icons.js';

export function renderProgress(root) {
  const s = streak();
  const days = history(118);
  const packs = content.packs;

  const wrap = el(`<div class="fade">
    <div class="topbar"><h1>Progress</h1></div>
    <div class="screen"></div>
  </div>`);
  const screen = wrap.querySelector('.screen');

  /* ---- headline numbers ---- */
  const last7 = days.slice(-7);
  const ans7 = last7.reduce((a, d) => a + d.items, 0);
  const ok7 = last7.reduce((a, d) => a + d.correct, 0);
  const allItems = content.items;
  const st = stats(allItems, state.records);
  const conceptList = allConcepts();
  const mastered = conceptList.filter((c) => {
    const m = groupMastery(c.items, state.records);
    const seen = c.items.some((i) => !isNew(state.records[i.id]));
    return masteryLevel(m, seen) === 4;
  }).length;

  screen.appendChild(el(`<div class="statgrid">
    <div class="stat"><b>${s.current}</b><span>day streak</span></div>
    <div class="stat"><b>${s.longest}</b><span>best streak</span></div>
    <div class="stat"><b>${totalXP()}</b><span>xp</span></div>
  </div>`));
  screen.appendChild(el(`<div class="statgrid" style="margin-top:10px">
    <div class="stat"><b>${ans7}</b><span>7d answered</span></div>
    <div class="stat"><b>${ans7 ? pct(ok7 / ans7) + '%' : '—'}</b><span>7d accuracy</span></div>
    <div class="stat"><b>${mastered}/${conceptList.length}</b><span>concepts</span></div>
  </div>`));

  /* ---- heatmap ---- */
  const heat = el(`<div class="card" style="margin-top:14px">
    <div class="row between" style="margin-bottom:10px">
      <div class="tiny">Daily activity</div>
      <div class="row small faint" style="gap:4px">
        less <span class="heat-cell"></span><span class="heat-cell l2"></span><span class="heat-cell l4"></span> more
      </div>
    </div>
    <div class="heat"></div>
  </div>`);
  const heatEl = heat.querySelector('.heat');
  // pad so each column is a full week starting Sunday
  const padded = [];
  const [fy, fm, fd] = days[0].key.split('-').map(Number);
  const firstDow = new Date(fy, fm - 1, fd).getDay();
  for (let i = 0; i < firstDow; i++) padded.push(null);
  padded.push(...days);
  for (let i = 0; i < padded.length; i += 7) {
    const col = el('<div class="heat-col"></div>');
    padded.slice(i, i + 7).forEach((d) => {
      if (!d) { col.appendChild(el('<div class="heat-cell" style="opacity:.25"></div>')); return; }
      const isToday = d.key === today();
      const c = el(`<div class="heat-cell l${d.level} ${isToday ? 'today' : ''}"></div>`);
      c.title = `${d.key}: ${d.items} answered`;
      col.appendChild(c);
    });
    heatEl.appendChild(col);
  }
  screen.appendChild(heat);
  setTimeout(() => { heatEl.scrollLeft = heatEl.scrollWidth; }, 0);

  /* ---- review forecast ---- */
  const forecast = new Array(8).fill(0);
  let overdue = 0;
  for (const it of allItems) {
    const r = state.records[it.id];
    if (!r || r.seen === 0) continue;
    const d = daysBetween(today(), r.due);
    if (d < 0) overdue += 1;
    else if (d <= 7) forecast[d] += 1;
  }
  const maxF = Math.max(1, ...forecast, overdue);
  screen.appendChild(el(`<div class="card">
    <div class="tiny" style="margin-bottom:10px">Upcoming reviews</div>
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
  </div>`));

  /* ---- needs attention ---- */
  const ranked = conceptList
    .map((c) => ({
      c,
      w: weakness(c.items, state.records),
      m: groupMastery(c.items, state.records),
      seen: c.items.some((i) => !isNew(state.records[i.id])),
      due: c.items.filter((i) => !isNew(state.records[i.id]) && isDue(state.records[i.id])).length,
      acc: accuracyOf(c.items),
    }))
    .filter((x) => x.seen && x.w > 0.35)
    .sort((a, b) => b.w - a.w)
    .slice(0, 8);

  const attention = el(`<div class="card">
    <div class="row between" style="margin-bottom:4px">
      <div class="tiny">Needs another look</div>
      <div class="tiny">${ranked.length}</div>
    </div></div>`);
  if (!ranked.length) {
    attention.appendChild(el('<div class="small faint" style="padding:8px 0">Nothing flagged yet. Answer a few sessions and weak spots will surface here.</div>'));
  } else {
    ranked.forEach((x) => {
      const row = el(`<button class="listrow" type="button">
        ${levelDot(masteryLevel(x.m, true))}
        <span class="grow">
          <span class="title ellips">${esc(x.c.title)}</span>
          <span class="sub">${esc(content.byUnit.get(x.c.unitId)?.title || '')} · ${pct(x.acc)}% right${x.due ? ` · ${x.due} due` : ''}</span>
        </span>
        <span class="chev">${icons.chev}</span>
      </button>`);
      row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(x.c.id)}`; };
      attention.appendChild(row);
    });
    const drill = el('<button class="btn secondary sm" style="width:100%;margin-top:12px" type="button">Drill weak spots</button>');
    drill.onclick = () => { location.hash = `#/session?mode=weak&pack=${encodeURIComponent(state.activePack || '')}`; };
    attention.appendChild(drill);
  }
  screen.appendChild(attention);

  /* ---- per-pack breakdown ---- */
  packs.forEach((p) => {
    const pItems = itemsOfPack(p.id);
    const pst = stats(pItems, state.records);
    const card = el(`<div class="card">
      <div class="row between" style="margin-bottom:8px">
        <div class="row" style="gap:8px">
          <span style="font-size:17px">${esc(p.emoji)}</span>
          <h3 style="font-size:15px">${esc(p.title)}</h3>
        </div>
        <span class="tiny">${pct(pst.mastery)}%</span>
      </div>
      ${bar(pst.mastery, 'good')}
      <div class="row small faint" style="gap:10px;margin-top:8px">
        <span>${pst.seen}/${pst.total} seen</span><span>${pst.due} due</span>
        <span>${pst.total ? pct(pst.accuracy) : 0}% lifetime</span>
      </div>
      <div class="hr"></div>
    </div>`);
    p.units.forEach((u) => {
      const items = itemsOfUnit(u.id);
      const m = groupMastery(items, state.records);
      const seen = items.filter((i) => !isNew(state.records[i.id])).length;
      const row = el(`<button class="listrow" type="button">
        <span class="grow">
          <span class="title ellips">${esc(u.title)}</span>
          <span class="sub">${seen}/${items.length} seen · ${LEVELS[masteryLevel(m, seen > 0)]}</span>
          <span style="display:block;margin-top:6px">${bar(m, m >= 0.8 ? 'good' : '')}</span>
        </span>
        <span class="chev">${icons.chev}</span>
      </button>`);
      row.onclick = () => { location.hash = `#/unit/${encodeURIComponent(u.id)}`; };
      card.appendChild(row);
    });
    screen.appendChild(card);
  });

  root.appendChild(wrap);
}

function accuracyOf(items) {
  let a = 0, r = 0;
  for (const it of items) {
    const rec = state.records[it.id];
    if (!rec) continue;
    a += rec.seen; r += rec.right;
  }
  return a ? r / a : 0;
}
