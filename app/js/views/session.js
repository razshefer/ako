import { el, esc, md, codeBlock, pct, haptic } from '../util.js';
import { content } from '../content.js';
import { state, markConceptSeen, streak, todayStats, streakCelebrationDue } from '../store.js';
import { buildQueue, createRun } from '../session.js';
import { createExercise } from '../components/exercise.js';
import { icons } from '../components/icons.js';
import { glossify, setConceptOpener } from '../glossary.js';
import { conceptSheet, closeConceptSheet } from '../components/conceptsheet.js';
import { play } from '../sound.js';
import { celebrateStreak } from '../components/celebrate.js';

export function renderSession(root, opts) {
  const items = buildQueue(opts);

  if (!items.length) {
    root.appendChild(el(`<div class="screen" style="padding-top:60px">
      <div class="empty"><div class="big">🎉</div>
        <p>Nothing queued here right now.</p>
        <p class="small">Come back when reviews are due, or open a unit and drill it directly.</p>
      </div>
      <button class="btn secondary" onclick="location.hash='#/'">Back</button>
    </div>`));
    return;
  }

  const run = createRun(items, opts);
  const view = el(`<div class="sess">
    <div class="sess-top">
      <button class="iconbtn" type="button" aria-label="Quit">${icons.close}</button>
      <div class="bar"><i style="width:0%"></i></div>
      <span class="tiny" style="min-width:38px;text-align:right"></span>
    </div>
    <div class="sess-body"></div>
  </div>`);
  const [quitBtn, progressBar, counter] = [
    view.querySelector('.iconbtn'),
    view.querySelector('.bar > i'),
    view.querySelector('.tiny'),
  ];
  const body = view.querySelector('.sess-body');
  const foot = el(`<div class="sess-foot"></div>`);

  quitBtn.onclick = () => {
    closeConceptSheet();
    if (run.pos === 0 || confirm('Quit this session? Answers so far are saved.')) {
      run.finish();
      location.hash = opts.mode === 'concept' || opts.mode === 'unit' ? '#/library' : '#/';
    }
  };

  root.appendChild(view);
  root.appendChild(foot);
  setConceptOpener((id) => conceptSheet(id, { backLabel: 'Back to session' }));

  function paintProgress() {
    progressBar.style.width = `${pct(run.progress)}%`;
    counter.textContent = `${Math.min(run.pos + 1, run.queue.length)}/${run.queue.length}`;
  }

  /* ---------- concept intro (shown once per concept) ---------- */
  function maybeIntro(item, then) {
    const c = content.byConcept.get(item.conceptId);
    if (!c || state.conceptSeen[c.id]) return then();

    markConceptSeen(c.id);
    body.innerHTML = '';
    const unit = content.byUnit.get(c.unitId);
    const intro = el(`<div class="fade">
      <div class="q-kicker">
        <span class="chip accent">New concept</span>
        <span class="chip">${esc(unit ? unit.title : '')}</span>
      </div>
      <h2 style="font-size:23px;letter-spacing:-.02em;margin-bottom:10px">${esc(c.title)}</h2>
      <div class="brief">${md(c.brief)}</div>
      ${(c.examples || []).map((ex) => codeBlock(ex.code, ex.lang || 'yaml', ex.label || null, ex.note || null)).join('')}
    </div>`);
    body.appendChild(intro);
    glossify(body);
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    const go = el('<button class="btn" type="button">Got it — practice this</button>');
    go.onclick = then;
    foot.appendChild(go);
    window.scrollTo(0, 0);
  }

  /* ---------- one question ---------- */
  function step() {
    if (run.done) return finish();
    paintProgress();
    const item = run.current;
    maybeIntro(item, () => ask(item));
  }

  function ask(item) {
    body.innerHTML = '';
    const concept = content.byConcept.get(item.conceptId);
    const ex = createExercise(item, () => { checkBtn.disabled = !ex.ready(); });

    // put the concept chip in the exercise's own kicker row rather than a second line
    const chips = `<span class="chip">${esc(concept ? concept.title : '')}</span>` +
      (run.retried.has(item.id) ? '<span class="chip bad">second look</span>' : '');
    const kicker = ex.node.querySelector('.q-kicker');
    if (kicker) kicker.insertAdjacentHTML('afterbegin', chips);
    else ex.node.insertAdjacentHTML('afterbegin', `<div class="q-kicker">${chips}</div>`);
    body.appendChild(ex.node);
    glossify(body);
    window.scrollTo(0, 0);

    foot.className = 'sess-foot';
    foot.innerHTML = '';
    const checkBtn = el('<button class="btn" type="button" disabled>Check</button>');
    foot.appendChild(checkBtn);
    if (ex.focus) setTimeout(() => ex.focus(), 60);

    // "match" completes itself — auto-check when all pairs are done
    const autoCheck = item.type === 'match';
    if (autoCheck) {
      const poll = setInterval(() => {
        if (ex.ready()) { clearInterval(poll); submit(); }
        if (!document.body.contains(foot)) clearInterval(poll);
      }, 250);
    }

    checkBtn.onclick = submit;
    document.onkeydown = (e) => {
      if (e.key === 'Enter' && !checkBtn.disabled) { e.preventDefault(); submit(); }
    };

    function submit() {
      document.onkeydown = null;
      const { correct, answerHTML } = ex.check();
      const res = run.submit(correct);
      haptic(correct ? 14 : 40);
      play(correct ? (res.firstTry ? 'correct' : 'correctAgain') : 'wrong');
      showVerdict(item, correct, answerHTML, res.requeued);
    }
  }

  function showVerdict(item, correct, answerHTML, requeued) {
    foot.className = `sess-foot ${correct ? 'ok' : 'no'}`;
    foot.innerHTML = '';
    const concept = content.byConcept.get(item.conceptId);
    const panel = el(`<div>
      <div class="verdict ${correct ? 'ok' : 'no'}">
        ${correct ? icons.check : icons.x}
        <span>${correct ? pickPraise() : 'Not quite'}</span>
      </div>
      <div class="explain">
        ${answerHTML ? `<span class="answer-was">${answerHTML}</span>` : ''}
        ${md(item.explain || '')}
        ${requeued ? '<p class="small faint">You will see this one again before the end.</p>' : ''}
      </div>
    </div>`);
    const btns = el('<div class="btn-row"></div>');
    if (concept) {
      const why = el('<button class="btn ghost" type="button" style="flex:0 0 auto;width:auto;padding:12px 14px">Explain</button>');
      // opens over the session; closing it puts you back on this exact question
      why.onclick = () => conceptSheet(concept.id, { backLabel: 'Back to session' });
      btns.appendChild(why);
    }
    const cont = el(`<button class="btn ${correct ? 'good' : 'danger'}" type="button">Continue</button>`);
    cont.onclick = () => { run.next(); step(); };
    btns.appendChild(cont);
    panel.appendChild(btns);
    foot.appendChild(panel);
    glossify(foot);

    document.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cont.click(); }
    };
  }

  /* ---------- summary ---------- */
  function finish() {
    document.onkeydown = null;
    if (streakCelebrationDue()) { celebrateStreak(() => finish()); return; }
    const sum = run.finish();
    const s = streak();
    const t = todayStats();
    const goal = state.settings.dailyGoal;
    const hitGoal = t.items >= goal;

    body.innerHTML = '';
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    progressBar.style.width = '100%';
    counter.textContent = '';

    const weak = [...run.firstTryOf.entries()].filter(([, ok]) => !ok)
      .map(([id]) => content.byItem.get(id))
      .filter(Boolean);
    const weakConcepts = [...new Set(weak.map((i) => i.conceptId))]
      .map((id) => content.byConcept.get(id)).filter(Boolean);

    play(hitGoal ? 'goal' : 'complete');
    body.appendChild(el(`<div class="summary fade">
      <div class="big">${sum.accuracy >= 0.9 ? '🎯' : sum.accuracy >= 0.6 ? '💪' : '📚'}</div>
      <h2>Session complete</h2>
      <p class="muted small">${sum.right}/${sum.answered} first try · ${sum.seconds}s</p>
    </div>`));

    body.appendChild(el(`<div class="statgrid">
      <div class="stat"><b>${pct(sum.accuracy)}%</b><span>accuracy</span></div>
      <div class="stat"><b>${t.items}/${goal}</b><span>daily goal</span></div>
      <div class="stat"><b>${s.current}</b><span>day streak</span></div>
    </div>`));

    if (hitGoal) {
      body.appendChild(el(`<div class="card" style="margin-top:14px;text-align:center">
        <div style="font-size:15px;font-weight:700">🔥 Daily goal reached</div>
        <div class="small muted">Streak is safe for today.</div>
      </div>`));
    }

    if (weakConcepts.length) {
      const card = el(`<div class="card" style="margin-top:14px">
        <div class="tiny" style="margin-bottom:6px">Worth another look</div></div>`);
      weakConcepts.forEach((c) => {
        const row = el(`<button class="listrow" type="button">
          <span class="dot m1"></span>
          <span class="grow"><span class="title">${esc(c.title)}</span>
          <span class="sub">${esc(content.byUnit.get(c.unitId)?.title || '')}</span></span>
          <span class="chev">${icons.chev}</span></button>`);
        row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(c.id)}`; };
        card.appendChild(row);
      });
      body.appendChild(card);
    }

    const again = el('<button class="btn" type="button">Another session</button>');
    again.onclick = () => { window.dispatchEvent(new CustomEvent('ako:render')); };
    const home = el('<button class="btn secondary" type="button">Done</button>');
    home.onclick = () => { location.hash = '#/'; };
    const row = el('<div class="btn-row"></div>');
    row.appendChild(home);
    row.appendChild(again);
    foot.appendChild(row);
    window.scrollTo(0, 0);
  }

  step();
}

const PRAISE = ['Correct', 'Nice', 'Exactly', 'Got it', 'Spot on', 'Yes'];
const pickPraise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
