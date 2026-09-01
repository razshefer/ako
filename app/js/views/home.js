import { el, esc, pct } from '../util.js';
import { content, itemsOfUnit, itemsOfPack } from '../content.js';
import { state, streak, todayStats, totalXP, setActivePack, flowState, dismissIntro } from '../store.js';
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
  const newInQueue = queuePreview.filter((i) => isNew(state.records[i.id])).length;

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
            : `${goal - t.items} more ${goal - t.items === 1 ? 'answer' : 'answers'} to keep it alive.`}
        </div>
        <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
          <span class="chip">${st.due} due</span>
          <span class="chip">${st.new} not seen</span>
          ${s.longest > 1 ? `<span class="chip">best ${s.longest}d</span>` : ''}
        </div>
      </div>
    </div>
  </div>`));

  if (!pack) {
    screen.appendChild(el('<div class="empty"><div class="big">📦</div>No content packs found.</div>'));
    root.appendChild(wrap);
    return;
  }

  /* ---- how this works (first run, and always available in Settings) ---- */
  if (!state.seenIntro) {
    const card = el(`<div class="card" style="border-color:var(--accent)">
      <div class="row between" style="margin-bottom:8px">
        <div class="tiny" style="color:var(--accent)">How this works</div>
      </div>
      ${howItWorksHTML()}
      <button class="btn secondary sm" style="width:100%;margin-top:14px" type="button">Got it</button>
    </div>`);
    card.querySelector('button').onclick = () => { dismissIntro(); window.dispatchEvent(new CustomEvent('reps:render')); };
    screen.appendChild(card);
  }

  /* ---- the two ways in ---- */
  const cur = currentUnit(pack.id);
  const nextFlow = pickFlow(pack, cur);

  const doNow = el(`<div class="card">
    <div class="tiny" style="margin-bottom:10px">Pick one — either is a full session</div>
  </div>`);

  const drillBtn = el(`<button class="btn" type="button">
    ${queuePreview.length ? (goalDone ? 'Another round of practice' : 'Practice') : 'Practice anyway'}
  </button>`);
  drillBtn.onclick = () => { location.hash = `#/session?mode=daily&pack=${encodeURIComponent(pack.id)}`; };
  doNow.appendChild(drillBtn);
  doNow.appendChild(el(`<div class="small faint" style="margin:8px 0 16px">
    ${queuePreview.length} questions${newInQueue ? ` · ${newInQueue} new` : ''}${st.due ? ` · ${Math.min(st.due, queuePreview.length - newInQueue)} due for review` : ''}.
    New ideas are explained before you are asked about them.
  </div>`));

  if (nextFlow) {
    const done = !!flowState(nextFlow.id)?.completed;
    const flowBtn = el(`<button class="btn ${done ? 'secondary' : ''}" type="button">
      ${done ? 'Replay walkthrough' : 'Walk through a real flow'}
    </button>`);
    flowBtn.onclick = () => { location.hash = `#/flow/${encodeURIComponent(nextFlow.id)}`; };
    doNow.appendChild(flowBtn);
    doNow.appendChild(el(`<div class="small faint" style="margin-top:8px">
      <b style="color:var(--fg)">${esc(nextFlow.title)}</b> — ${esc(nextFlow.subtitle || '')}
      ${nextFlow.minutes ? ` (${nextFlow.minutes} min)` : ''}
    </div>`));
  }
  screen.appendChild(doNow);

  /* ---- today numbers ---- */
  screen.appendChild(el(`<div class="statgrid">
    ${stat(t.items, 'answered')}
    ${stat(t.items ? pct(t.correct / t.items) + '%' : '—', 'accuracy')}
    ${stat(Math.round(t.seconds / 60) + 'm', 'time')}
  </div>`));

  /* ---- walkthroughs ---- */
  if (pack.flows.length) {
    const flows = el(`<div class="card" style="margin-top:14px">
      <div class="row between" style="margin-bottom:4px">
        <div class="tiny">Walkthroughs</div>
        <div class="tiny">${pack.flows.filter((f) => flowState(f.id)?.completed).length}/${pack.flows.length}</div>
      </div>
      <div class="small faint" style="margin-bottom:6px">
        End-to-end traces: predict each step, then see what really happens.
      </div>
    </div>`);
    pack.flows.forEach((f) => flows.appendChild(flowRow(f)));
    screen.appendChild(flows);
  }

  /* ---- the drill path ---- */
  const path = el(`<div class="card">
    <div class="row between" style="margin-bottom:6px">
      <div class="row" style="gap:8px">
        <span style="font-size:18px">${esc(pack.emoji)}</span>
        <h3 style="font-size:16px">${esc(pack.title)}</h3>
      </div>
      <span class="tiny">${pct(st.mastery)}% mastered</span>
    </div>
    ${bar(st.mastery, 'good')}
    <div class="small faint" style="margin-top:8px">
      Practice walks this list for you — you do not have to pick.
    </div>
    <div style="margin-top:2px"></div>
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
          ${unlocked ? `${items.length} questions · ${pct(m)}%` : 'unlocks as you work through the one above'}
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
    const others = el('<div class="card"><div class="tiny" style="margin-bottom:8px">Switch subject</div></div>');
    content.packs.filter((p) => p.id !== pack.id).forEach((p) => {
      const items = itemsOfPack(p.id);
      const m = groupMastery(items, state.records);
      const row = el(`<button class="listrow" type="button">
        <span style="font-size:20px">${esc(p.emoji)}</span>
        <span class="grow"><span class="title">${esc(p.title)}</span>
        <span class="sub">${items.length} questions · ${pct(m)}%</span></span>
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

/** A walkthrough row, used on Home and in the Library. */
export function flowRow(f) {
  const st = flowState(f.id);
  const done = !!st?.completed;
  const row = el(`<button class="flowrow ${done ? 'done' : ''}" type="button">
    <span class="badge">${done ? icons.check : icons.play}</span>
    <span class="grow">
      <span class="title">${esc(f.title)}</span>
      <span class="sub">${f.steps.length} steps${f.minutes ? ` · ${f.minutes} min` : ''}${
        done ? ` · ${pct(st.lastScore ?? 0)}% predicted` : ''
      }</span>
    </span>
    <span class="chev">${icons.chev}</span>
  </button>`);
  row.onclick = () => { location.hash = `#/flow/${encodeURIComponent(f.id)}`; };
  return row;
}

/** The next walkthrough worth doing: unfinished first, preferring the current unit. */
function pickFlow(pack, curUnit) {
  if (!pack.flows.length) return null;
  const undone = pack.flows.filter((f) => !flowState(f.id)?.completed);
  const pool = undone.length ? undone : pack.flows;
  if (curUnit) {
    const local = pool.find((f) => (f.concepts || []).some((c) => c.startsWith(`${curUnit.id}/`)));
    if (local) return local;
  }
  return pool[0];
}

export function howItWorksHTML() {
  return `<ol class="steps-explainer">
    <li><b>Just hit Practice.</b> Nothing to read first. The first time a new idea
      comes up you get a short explanation with real commands, then questions on it.</li>
    <li><b>Walkthroughs</b> take one real sequence — a deploy, a node dying, a
      request finding a pod — and step through it. You predict each step, then see
      what actually happens.</li>
    <li><b>Tap any underlined word</b> for a one-line definition, mid-question.
      Nothing has to be memorized up front.</li>
    <li><b>The Library is reference, not homework.</b> Browse it when you want the
      full write-up. Progress shows what to come back to.</li>
  </ol>`;
}
