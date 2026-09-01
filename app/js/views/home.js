import { el, esc, pct } from '../util.js';
import { content, itemsOfUnit, itemsOfPack } from '../content.js';
import { state, streak, todayStats, totalXP, setActivePack } from '../store.js';
import { stats, groupMastery, masteryLevel, isNew } from '../srs.js';
import { unitUnlocked, currentUnit, buildQueue } from '../session.js';
import { ring, bar, stat, levelDot } from '../components/bits.js';
import { icons } from '../components/icons.js';

export function renderHome(root) {
  const pack = content.byPack.get(state.activePack) || content.packs[0];
  const s = streak();
  const t = todayStats();
  const goal = state.settings.dailyGoal;

  const packItems = pack ? itemsOfPack(pack.id) : [];
  const st = stats(packItems, state.records);
  const queuePreview = pack ? buildQueue({ mode: 'daily', packId: pack.id }) : [];

  const wrap = el(`<div class="fade">
    <div class="topbar">
      <h1>Reps</h1>
      <div class="spacer"></div>
      <span class="chip gold">${icons.flame}${s.current}</span>
      <span class="chip accent">${icons.bolt}${totalXP()}</span>
    </div>
    <div class="screen"></div>
  </div>`);
  const screen = wrap.querySelector('.screen');

  /* ---- hero ---- */
  const goalDone = t.items >= goal;
  screen.appendChild(el(`<div class="hero">
    <div class="streakwrap">
      ${ring(Math.min(t.items, goal), goal, `${t.items}/${goal}`, 'TODAY')}
      <div class="grow">
        <div style="font-size:18px;font-weight:800;letter-spacing:-.01em">
          ${goalDone ? 'Daily goal done ✅' : s.current > 0 ? `${s.current}-day streak` : 'Start your streak'}
        </div>
        <div class="small muted" style="margin-top:4px">
          ${goalDone
            ? 'Anything more today is a bonus.'
            : `${goal - t.items} more ${goal - t.items === 1 ? 'exercise' : 'exercises'} to keep it alive.`}
        </div>
        <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
          <span class="chip">${st.due} due</span>
          <span class="chip">${st.new} new</span>
          ${s.longest > 1 ? `<span class="chip">best ${s.longest}d</span>` : ''}
        </div>
      </div>
    </div>
  </div>`));

  /* ---- primary action ---- */
  if (!pack) {
    screen.appendChild(el(`<div class="empty"><div class="big">📦</div>No content packs found.</div>`));
    root.appendChild(wrap);
    return;
  }

  const cta = el(`<button class="btn" type="button">
    ${queuePreview.length ? (goalDone ? 'Another round' : 'Start session') : 'Nothing due — practice anyway'}
  </button>`);
  cta.onclick = () => { location.hash = `#/session?mode=daily&pack=${encodeURIComponent(pack.id)}`; };
  screen.appendChild(cta);

  const sub = el(`<div class="btn-row" style="margin-top:10px"></div>`);
  const weakBtn = el(`<button class="btn secondary" type="button">Weak spots</button>`);
  weakBtn.onclick = () => { location.hash = `#/session?mode=weak&pack=${encodeURIComponent(pack.id)}`; };
  weakBtn.disabled = st.seen === 0;
  sub.appendChild(weakBtn);
  const libBtn = el(`<button class="btn secondary" type="button">Browse</button>`);
  libBtn.onclick = () => { location.hash = `#/library/${encodeURIComponent(pack.id)}`; };
  sub.appendChild(libBtn);
  screen.appendChild(sub);

  /* ---- today numbers ---- */
  screen.appendChild(el(`<div class="statgrid" style="margin-top:14px">
    ${stat(t.items, 'answered')}
    ${stat(t.items ? pct(t.correct / t.items) + '%' : '—', 'accuracy')}
    ${stat(Math.round(t.seconds / 60) + 'm', 'time')}
  </div>`));

  /* ---- pack path ---- */
  const cur = currentUnit(pack.id);
  const path = el(`<div class="card" style="margin-top:14px">
    <div class="row between" style="margin-bottom:6px">
      <div class="row" style="gap:8px">
        <span style="font-size:18px">${esc(pack.emoji)}</span>
        <h3 style="font-size:16px">${esc(pack.title)}</h3>
      </div>
      <span class="tiny">${pct(st.mastery)}% mastered</span>
    </div>
    ${bar(st.mastery, 'good')}
    <div style="margin-top:6px"></div>
  </div>`);

  pack.units.forEach((u, i) => {
    const items = itemsOfUnit(u.id);
    const m = groupMastery(items, state.records);
    const seenAny = items.some((it) => !isNew(state.records[it.id]));
    const unlocked = unitUnlocked(u);
    const isCur = cur && cur.id === u.id;
    const done = m >= 0.8;
    const row = el(`<button class="pathrow ${done ? 'done' : ''} ${isCur ? 'active' : ''} ${unlocked ? '' : 'locked'}" type="button">
      <span class="num">${done ? '✓' : i + 1}</span>
      <span class="grow">
        <span class="title">${esc(u.title)}</span>
        <span class="sub">
          ${unlocked ? `${items.length} exercises · ${pct(m)}%` : 'locked — finish the previous unit'}
        </span>
      </span>
      ${levelDot(masteryLevel(m, seenAny))}
      <span class="chev">${icons.chev}</span>
    </button>`);
    row.onclick = () => { location.hash = `#/unit/${encodeURIComponent(u.id)}`; };
    path.appendChild(row);
  });
  screen.appendChild(path);

  /* ---- other packs ---- */
  if (content.packs.length > 1) {
    const others = el(`<div class="card"><div class="tiny" style="margin-bottom:8px">Switch subject</div></div>`);
    content.packs.filter((p) => p.id !== pack.id).forEach((p) => {
      const items = itemsOfPack(p.id);
      const m = groupMastery(items, state.records);
      const row = el(`<button class="listrow" type="button">
        <span style="font-size:20px">${esc(p.emoji)}</span>
        <span class="grow"><span class="title">${esc(p.title)}</span>
        <span class="sub">${items.length} exercises · ${pct(m)}%</span></span>
        <span class="chev">${icons.chev}</span>
      </button>`);
      row.onclick = () => {
        setActivePack(p.id);
        window.dispatchEvent(new CustomEvent('reps:render'));
      };
      others.appendChild(row);
    });
    screen.appendChild(others);
  }

  root.appendChild(wrap);
}
