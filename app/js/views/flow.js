// Walkthrough player: step through a real sequence of events, predicting what
// happens next before each reveal.

import { el, esc, md, mdInline, codeBlock, pct, haptic, shuffle } from '../util.js';
import { content } from '../content.js';
import { answerFlowStep, completeFlow, flowState, addSessionTime } from '../store.js';
import { glossify, setConceptOpener } from '../glossary.js';
import { icons } from '../components/icons.js';
import { conceptSheet } from '../components/conceptsheet.js';

export function renderFlow(root, flowId) {
  const flow = content.byFlow.get(flowId);
  if (!flow) {
    root.appendChild(el('<div class="empty">Walkthrough not found.</div>'));
    return;
  }

  const prev = flowState(flow.id);
  let pos = -1;                       // -1 = the intro card
  let right = 0, asked = 0;
  const startedAt = Date.now();

  const view = el(`<div class="sess">
    <div class="sess-top">
      <button class="iconbtn" type="button" aria-label="Close">${icons.close}</button>
      <div class="bar"><i style="width:0%"></i></div>
      <span class="tiny" style="min-width:44px;text-align:right"></span>
    </div>
    <div class="sess-body flow-body"></div>
  </div>`);
  const closeBtn = view.querySelector('.iconbtn');
  const progressBar = view.querySelector('.bar > i');
  const counter = view.querySelector('.tiny');
  const body = view.querySelector('.sess-body');
  const foot = el('<div class="sess-foot"></div>');

  closeBtn.onclick = () => { location.hash = `#/library/${encodeURIComponent(flow.packId)}`; };

  root.appendChild(view);
  root.appendChild(foot);

  // terms inside the walkthrough open over it, never navigating away
  setConceptOpener((conceptId) => conceptSheet(conceptId));

  function paint() {
    const total = flow.steps.length;
    progressBar.style.width = `${pct(Math.max(0, pos) / total)}%`;
    counter.textContent = pos < 0 ? '' : `${Math.min(pos + 1, total)}/${total}`;
  }

  /* ---------------- intro ---------------- */
  function intro() {
    body.innerHTML = '';
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    paint();

    const concepts = (flow.concepts || [])
      .map((id) => content.byConcept.get(id))
      .filter(Boolean);

    body.appendChild(el(`<div class="fade">
      <div class="q-kicker">
        <span class="chip accent">Walkthrough</span>
        ${flow.minutes ? `<span class="chip">${flow.minutes} min</span>` : ''}
        ${prev?.completed ? '<span class="chip good">done before</span>' : ''}
      </div>
      <h2 class="flow-title">${esc(flow.title)}</h2>
      <p class="muted" style="margin-top:6px">${esc(flow.subtitle || '')}</p>
      <div class="card" style="margin-top:16px">
        <div class="tiny" style="margin-bottom:8px">The situation</div>
        <div class="flow-note">${md(flow.scenario || '')}</div>
      </div>
      ${concepts.length ? `<div class="card">
        <div class="tiny" style="margin-bottom:8px">Pieces you will see interact</div>
        <div class="row wrap" style="gap:6px">
          ${concepts.map((c) => `<span class="chip">${esc(c.title)}</span>`).join('')}
        </div>
      </div>` : ''}
      <p class="small faint" style="margin-top:4px">
        At each step you predict what happens next, then see what actually does.
      </p>
    </div>`));

    const go = el('<button class="btn" type="button">Start the walkthrough</button>');
    go.onclick = () => { pos = 0; step(); };
    foot.appendChild(go);
    glossify(body);
    window.scrollTo(0, 0);
  }

  /* ---------------- one step ---------------- */
  function step() {
    if (pos >= flow.steps.length) return finish();
    paint();
    const s = flow.steps[pos];
    body.innerHTML = '';
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    window.scrollTo(0, 0);

    if (s.ask) askThenReveal(s);
    else reveal(s);
  }

  function stageHeader(s) {
    return `<div class="q-kicker">
      ${s.actor ? `<span class="chip accent">${esc(s.actor)}</span>` : ''}
      <span class="chip">step ${pos + 1} of ${flow.steps.length}</span>
    </div>`;
  }

  /** Predict first: the question is about what this step is going to do. */
  function askThenReveal(s) {
    const ask = s.ask;
    const order = shuffle(ask.choices.map((_, i) => i));
    const node = el(`<div class="fade">
      ${stageHeader(s)}
      <div class="q-prompt">${mdInline(ask.prompt)}</div>
      ${ask.code ? codeBlock(ask.code.text, ask.code.lang || 'bash', ask.code.label || null) : ''}
      <div class="choices"></div>
    </div>`);
    const list = node.querySelector('.choices');
    let picked = null;

    order.forEach((idx, n) => {
      const b = el(`<button class="choice radio" type="button">
        <span class="mark">${'ABCD'[n] || ''}</span>
        <span class="grow">${mdInline(ask.choices[idx])}</span>
      </button>`);
      b.dataset.idx = String(idx);
      b.onclick = () => {
        picked = idx;
        list.querySelectorAll('.choice').forEach((x) => x.classList.toggle('sel', x === b));
        checkBtn.disabled = false;
        haptic(8);
      };
      list.appendChild(b);
    });
    body.appendChild(node);
    glossify(body);

    const checkBtn = el('<button class="btn" type="button" disabled>Lock it in</button>');
    checkBtn.onclick = () => {
      const correct = picked === ask.answer;
      asked += 1;
      if (correct) right += 1;
      answerFlowStep(correct);
      haptic(correct ? 14 : 40);
      list.querySelectorAll('.choice').forEach((x) => {
        const i = Number(x.dataset.idx);
        x.disabled = true;
        x.classList.remove('sel');
        if (i === ask.answer) x.classList.add('ok');
        else if (i === picked) x.classList.add('no');
      });
      foot.className = `sess-foot ${correct ? 'ok' : 'no'}`;
      foot.innerHTML = '';
      const verdict = el(`<div>
        <div class="verdict ${correct ? 'ok' : 'no'}">
          ${correct ? icons.check : icons.x}
          <span>${correct ? 'That is what happens' : 'Not what happens'}</span>
        </div>
      </div>`);
      const on = el('<button class="btn ' + (correct ? 'good' : 'danger') + '" type="button">See what actually happens</button>');
      on.onclick = () => reveal(s, { asked: true, correct });
      verdict.appendChild(on);
      foot.appendChild(verdict);
    };
    foot.appendChild(checkBtn);
  }

  /** Show the step itself. */
  function reveal(s, outcome = null) {
    body.innerHTML = '';
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    window.scrollTo(0, 0);

    const node = el(`<div class="fade">
      ${stageHeader(s)}
      <h3 class="flow-step-title">${esc(s.title)}</h3>
      ${outcome ? `<div class="flow-verdict ${outcome.correct ? 'ok' : 'no'}">
          ${outcome.correct ? 'You called it.' : 'Worth re-reading — this is the bit that surprised you.'}
        </div>` : ''}
      <div class="flow-note" style="margin-top:10px">${md(s.body || '')}</div>
      ${s.code ? codeBlock(s.code.text, s.code.lang || 'bash', s.code.label || null, s.code.note || null) : ''}
      ${s.ask?.explain ? `<div class="card" style="margin-top:14px">
          <div class="tiny" style="margin-bottom:6px">Why</div>
          <div class="flow-note small">${md(s.ask.explain)}</div>
        </div>` : ''}
      ${s.watch ? `<div class="flow-watch">
          <div class="tiny" style="margin-bottom:6px">See it yourself</div>
          <div class="flow-note small">${md(s.watch)}</div>
        </div>` : ''}
    </div>`);
    body.appendChild(node);
    glossify(body);

    const next = el(`<button class="btn" type="button">${
      pos + 1 >= flow.steps.length ? 'Finish' : 'Next step'
    }</button>`);
    next.onclick = () => { pos += 1; step(); };
    foot.appendChild(next);
  }

  /* ---------------- outro ---------------- */
  function finish() {
    const score = asked ? right / asked : 1;
    completeFlow(flow.id, score);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    addSessionTime(Math.min(seconds, 60 * 60));

    body.innerHTML = '';
    foot.className = 'sess-foot';
    foot.innerHTML = '';
    progressBar.style.width = '100%';
    counter.textContent = '';

    body.appendChild(el(`<div class="summary fade">
      <div class="big">${score >= 0.8 ? '🧠' : '🔁'}</div>
      <h2>Walkthrough complete</h2>
      <p class="muted small">${asked ? `${right}/${asked} predictions right · ` : ''}${seconds}s</p>
    </div>`));

    if (flow.takeaways?.length) {
      const card = el(`<div class="card">
        <div class="tiny" style="margin-bottom:8px">What to carry away</div>
        <ul class="flow-note" style="padding-left:1.1em;margin:0"></ul>
      </div>`);
      const ul = card.querySelector('ul');
      flow.takeaways.forEach((t) => ul.appendChild(el(`<li style="margin:.4em 0">${mdInline(t)}</li>`)));
      body.appendChild(card);
      glossify(body);
    }

    const concepts = (flow.concepts || []).map((id) => content.byConcept.get(id)).filter(Boolean);
    if (concepts.length) {
      const card = el('<div class="card"><div class="tiny" style="margin-bottom:4px">Drill these</div></div>');
      concepts.forEach((c) => {
        const row = el(`<button class="listrow" type="button">
          <span class="grow"><span class="title">${esc(c.title)}</span>
          <span class="sub">${esc(content.byUnit.get(c.unitId)?.title || '')}</span></span>
          <span class="chev">${icons.chev}</span></button>`);
        row.onclick = () => { location.hash = `#/concept/${encodeURIComponent(c.id)}`; };
        card.appendChild(row);
      });
      body.appendChild(card);
    }

    const practice = el('<button class="btn" type="button">Practice what this covered</button>');
    practice.onclick = () => {
      const first = (flow.concepts || [])[0];
      location.hash = first
        ? `#/session?mode=concept&concept=${encodeURIComponent(first)}`
        : `#/session?mode=daily&pack=${encodeURIComponent(flow.packId)}`;
    };
    const done = el('<button class="btn secondary" type="button">Done</button>');
    done.onclick = () => { location.hash = '#/'; };
    const row = el('<div class="btn-row"></div>');
    row.append(done, practice);
    foot.appendChild(row);
    window.scrollTo(0, 0);
  }

  intro();
}

