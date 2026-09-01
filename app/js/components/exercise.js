// Renders one exercise item and owns its interaction until it is checked.
//
// Every factory returns:
//   { node, ready(), check() -> { correct, answerHTML } }
// `check()` also locks the widget and paints the right/wrong state.

import { el, esc, md, mdInline, codeBlock, shuffle, normalizeAnswer, haptic } from '../util.js';

const LETTERS = 'ABCDEFGH';

function questionHead(item) {
  const kicker = [];
  if (item.tag) kicker.push(`<span class="chip">${esc(item.tag)}</span>`);
  const code = item.code ? codeBlock(item.code.text, item.code.lang || 'yaml', item.code.label || null) : '';
  const hint = item.hint ? `<div class="small faint" style="margin-top:8px">${md(item.hint)}</div>` : '';
  return `
    ${kicker.length ? `<div class="q-kicker">${kicker.join('')}</div>` : ''}
    <div class="q-prompt">${mdInline(item.prompt)}</div>
    ${code}${hint}`;
}

/* ---------------- multiple choice (single answer) ---------------- */
function mcq(item, onChange) {
  const order = shuffle(item.choices.map((c, i) => i));
  const node = el(`<div>${questionHead(item)}<div class="choices"></div></div>`);
  const list = node.querySelector('.choices');
  let picked = null;

  order.forEach((origIdx, pos) => {
    const b = el(`<button class="choice radio" type="button">
        <span class="mark">${LETTERS[pos]}</span>
        <span class="grow">${mdInline(item.choices[origIdx])}</span>
      </button>`);
    b.dataset.idx = String(origIdx);
    b.onclick = () => {
      picked = origIdx;
      list.querySelectorAll('.choice').forEach((n) => n.classList.toggle('sel', n === b));
      haptic(8);
      onChange();
    };
    list.appendChild(b);
  });

  return {
    node,
    ready: () => picked !== null,
    check() {
      const correct = picked === item.answer;
      list.querySelectorAll('.choice').forEach((n) => {
        const i = Number(n.dataset.idx);
        n.disabled = true;
        n.classList.remove('sel');
        if (i === item.answer) n.classList.add('ok');
        else if (i === picked) n.classList.add('no');
      });
      return { correct, answerHTML: correct ? '' : `Answer: ${mdInline(item.choices[item.answer])}` };
    },
  };
}

/* ---------------- multiple choice (several answers) ---------------- */
function multi(item, onChange) {
  const order = shuffle(item.choices.map((c, i) => i));
  const node = el(`<div>${questionHead(item)}
      <div class="small faint" style="margin-top:10px">Select all that apply.</div>
      <div class="choices"></div></div>`);
  const list = node.querySelector('.choices');
  const picked = new Set();

  order.forEach((origIdx) => {
    const b = el(`<button class="choice" type="button">
        <span class="mark"></span>
        <span class="grow">${mdInline(item.choices[origIdx])}</span>
      </button>`);
    b.dataset.idx = String(origIdx);
    b.onclick = () => {
      if (picked.has(origIdx)) picked.delete(origIdx); else picked.add(origIdx);
      b.classList.toggle('sel', picked.has(origIdx));
      b.querySelector('.mark').textContent = picked.has(origIdx) ? '✓' : '';
      haptic(8);
      onChange();
    };
    list.appendChild(b);
  });

  return {
    node,
    ready: () => picked.size > 0,
    check() {
      const want = new Set(item.answers);
      const correct = want.size === picked.size && [...want].every((i) => picked.has(i));
      list.querySelectorAll('.choice').forEach((n) => {
        const i = Number(n.dataset.idx);
        n.disabled = true;
        n.classList.remove('sel');
        if (want.has(i)) { n.classList.add('ok'); n.querySelector('.mark').textContent = '✓'; }
        else if (picked.has(i)) { n.classList.add('no'); n.querySelector('.mark').textContent = '✕'; }
      });
      const answerHTML = correct ? '' : `Correct set: ${item.answers.map((i) => mdInline(item.choices[i])).join(' · ')}`;
      return { correct, answerHTML };
    },
  };
}

/* ---------------- type the answer ---------------- */
function fill(item, onChange) {
  const node = el(`<div>${questionHead(item)}
      <input class="fillinput" type="text" autocomplete="off" autocapitalize="off"
             autocorrect="off" spellcheck="false"
             placeholder="${esc(item.placeholder || 'Type your answer')}" /></div>`);
  const input = node.querySelector('input');
  input.addEventListener('input', onChange);

  return {
    node,
    focus: () => input.focus(),
    ready: () => input.value.trim().length > 0,
    check() {
      const given = normalizeAnswer(input.value);
      const correct = item.accept.some((a) => normalizeAnswer(a) === given);
      input.disabled = true;
      input.classList.add(correct ? 'ok' : 'no');
      return { correct, answerHTML: correct ? '' : `Answer: <code class="inline">${esc(item.accept[0])}</code>` };
    },
  };
}

/* ---------------- put the steps in order ---------------- */
function order(item, onChange) {
  const shuffled = shuffle(item.steps.map((s, i) => i));
  const node = el(`<div>${questionHead(item)}
      <div class="small faint" style="margin-top:10px">Tap the steps in the right order.</div>
      <div class="orderlist"></div></div>`);
  const list = node.querySelector('.orderlist');
  const picks = [];

  const paint = () => {
    list.querySelectorAll('.orderslot').forEach((n) => {
      const i = Number(n.dataset.idx);
      const p = picks.indexOf(i);
      n.classList.toggle('picked', p >= 0);
      n.querySelector('.idx').textContent = p >= 0 ? String(p + 1) : '';
    });
    onChange();
  };

  shuffled.forEach((origIdx) => {
    const b = el(`<button class="orderslot" type="button">
        <span class="idx"></span><span class="grow">${mdInline(item.steps[origIdx])}</span>
      </button>`);
    b.dataset.idx = String(origIdx);
    b.onclick = () => {
      const at = picks.indexOf(origIdx);
      if (at >= 0) picks.splice(at, 1); else picks.push(origIdx);
      haptic(8);
      paint();
    };
    list.appendChild(b);
  });

  return {
    node,
    ready: () => picks.length === item.steps.length,
    check() {
      const correct = picks.every((v, i) => v === i);
      // re-render in the user's order, marking each position
      list.innerHTML = '';
      picks.forEach((origIdx, pos) => {
        const good = origIdx === pos;
        list.appendChild(el(`<div class="orderslot ${good ? 'ok' : 'no'}">
            <span class="idx">${pos + 1}</span>
            <span class="grow">${mdInline(item.steps[origIdx])}</span>
          </div>`));
      });
      const answerHTML = correct ? '' :
        'Correct order:<br>' + item.steps.map((s, i) => `${i + 1}. ${esc(stripMd(s))}`).join('<br>');
      return { correct, answerHTML };
    },
  };
}

/* ---------------- match pairs ---------------- */
function match(item, onChange) {
  const left = shuffle(item.pairs.map((p, i) => ({ text: p[0], i })));
  const right = shuffle(item.pairs.map((p, i) => ({ text: p[1], i })));
  const node = el(`<div>${questionHead(item)}
      <div class="small faint" style="margin-top:10px">Tap a pair to match them.</div>
      <div class="matchgrid"></div></div>`);
  const grid = node.querySelector('.matchgrid');
  let selLeft = null, selRight = null, mistakes = 0, matched = 0;

  const rows = Math.max(left.length, right.length);
  for (let r = 0; r < rows; r++) {
    grid.appendChild(btn(left[r], 'l'));
    grid.appendChild(btn(right[r], 'r'));
  }

  function btn(entry, side) {
    if (!entry) return el('<div></div>');
    const b = el(`<button class="matchbtn" type="button">${mdInline(entry.text)}</button>`);
    b.dataset.pair = String(entry.i);
    b.dataset.side = side;
    b.onclick = () => {
      if (b.classList.contains('done')) return;
      if (side === 'l') { clearSel('l'); selLeft = b; } else { clearSel('r'); selRight = b; }
      b.classList.add('sel');
      haptic(8);
      if (selLeft && selRight) resolve();
      onChange();
    };
    return b;
  }
  function clearSel(side) {
    grid.querySelectorAll(`.matchbtn[data-side="${side}"]`).forEach((n) => n.classList.remove('sel'));
  }
  function resolve() {
    const a = selLeft, b = selRight;
    selLeft = selRight = null;
    if (a.dataset.pair === b.dataset.pair) {
      a.classList.remove('sel'); b.classList.remove('sel');
      a.classList.add('done'); b.classList.add('done');
      a.disabled = b.disabled = true;
      matched += 1;
    } else {
      mistakes += 1;
      a.classList.add('no'); b.classList.add('no');
      haptic(30);
      setTimeout(() => {
        a.classList.remove('no', 'sel'); b.classList.remove('no', 'sel');
        onChange();
      }, 550);
    }
    onChange();
  }

  return {
    node,
    ready: () => matched === item.pairs.length,
    check() {
      const correct = mistakes === 0;
      const answerHTML = correct ? '' :
        `${mistakes} wrong ${mistakes === 1 ? 'attempt' : 'attempts'} — pairs:<br>` +
        item.pairs.map((p) => `${esc(stripMd(p[0]))} → ${esc(stripMd(p[1]))}`).join('<br>');
      return { correct, answerHTML };
    },
  };
}

const stripMd = (s) => String(s).replace(/[`*]/g, '');


const FACTORIES = { mcq, multi, fill, order, match };

export function createExercise(item, onChange) {
  const f = FACTORIES[item.type];
  if (!f) {
    return {
      node: el(`<div class="card">Unsupported exercise type <code class="inline">${esc(item.type)}</code>.</div>`),
      ready: () => true,
      check: () => ({ correct: true, answerHTML: '' }),
    };
  }
  return f(item, onChange);
}
