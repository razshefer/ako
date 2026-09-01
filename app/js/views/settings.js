import { el, esc, toast, today, clamp } from '../util.js';
import { content } from '../content.js';
import { state, setSetting, exportJSON, importJSON, resetProgress, DEFAULT_SETTINGS } from '../store.js';

export function renderSettings(root) {
  const wrap = el(`<div class="fade">
    <div class="topbar"><h1>Settings</h1></div>
    <div class="screen"></div>
  </div>`);
  const screen = wrap.querySelector('.screen');

  /* ---- daily practice ---- */
  const practice = el('<div class="card"><div class="tiny" style="margin-bottom:4px">Daily practice</div></div>');
  practice.appendChild(numRow('Daily goal', 'Exercises per day needed to keep the streak.', 'dailyGoal', 3, 60));
  practice.appendChild(numRow('Session length', 'Exercises in one session.', 'sessionLength', 4, 40));
  practice.appendChild(numRow('New per session', 'How much brand-new material to mix in. More is used when nothing is due.', 'newPerSession', 0, 20));
  practice.appendChild(toggleRow('Guided path', 'Unlock units in order instead of mixing everything.', 'linearPath'));
  screen.appendChild(practice);

  /* ---- appearance ---- */
  const appearance = el('<div class="card"><div class="tiny" style="margin-bottom:4px">Appearance</div></div>');
  const themeRow = el(`<div class="setrow">
    <div class="grow"><div style="font-weight:650">Light theme</div>
    <div class="small faint">Default is dark.</div></div></div>`);
  const themeSw = el(`<button class="switch ${state.settings.theme === 'light' ? 'on' : ''}" type="button"><i></i></button>`);
  themeSw.onclick = () => {
    setSetting('theme', state.settings.theme === 'light' ? 'dark' : 'light');
    themeSw.classList.toggle('on', state.settings.theme === 'light');
  };
  themeRow.appendChild(themeSw);
  appearance.appendChild(themeRow);
  screen.appendChild(appearance);

  /* ---- backup ---- */
  const backup = el(`<div class="card">
    <div class="tiny" style="margin-bottom:8px">Backup &amp; restore</div>
    <div class="small muted" style="margin-bottom:10px">
      Progress lives in this browser only. Export before clearing site data or moving to another device.
    </div>
    <div class="btn-row"></div>
    <textarea class="io" style="margin-top:12px" spellcheck="false" placeholder="Paste a backup here to restore it"></textarea>
    <div class="btn-row" style="margin-top:8px"></div>
  </div>`);
  const [topRow, bottomRow] = backup.querySelectorAll('.btn-row');
  const io = backup.querySelector('textarea');

  const dl = el('<button class="btn secondary sm" style="flex:1" type="button">Download backup</button>');
  dl.onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reps-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const show = el('<button class="btn secondary sm" style="flex:1" type="button">Copy to box</button>');
  show.onclick = () => { io.value = exportJSON(); toast('Backup written below'); };
  topRow.append(dl, show);

  const restore = el('<button class="btn secondary sm" style="flex:1" type="button">Restore from box</button>');
  restore.onclick = () => {
    try {
      importJSON(io.value);
      toast('Progress restored');
      window.dispatchEvent(new CustomEvent('reps:render'));
    } catch (e) {
      toast(`Import failed: ${e.message}`);
    }
  };
  const wipe = el('<button class="btn ghost sm" style="flex:1" type="button">Reset progress</button>');
  wipe.onclick = () => {
    if (confirm('Erase all answers, streaks and scheduling? Settings are kept.')) {
      resetProgress();
      toast('Progress cleared');
      window.dispatchEvent(new CustomEvent('reps:render'));
    }
  };
  bottomRow.append(restore, wipe);
  screen.appendChild(backup);

  /* ---- content ---- */
  const packs = content.packs.map((p) => `${p.emoji} ${p.title} — ${p.units.length} units, ${p.itemCount} exercises`).join('\n');
  screen.appendChild(el(`<div class="card">
    <div class="tiny" style="margin-bottom:8px">Content</div>
    <pre class="code">${esc(packs || 'no packs')}</pre>
    ${content.problems.length
      ? `<div class="small" style="margin-top:10px;color:var(--bad)">${content.problems.length} content warning(s)</div>
         <pre class="code">${esc(content.problems.slice(0, 30).join('\n'))}</pre>`
      : '<div class="small faint" style="margin-top:10px">No content warnings.</div>'}
    <div class="small faint" style="margin-top:10px">
      Add a subject by dropping a folder in <code class="inline">/content</code> and listing it in
      <code class="inline">content/packs.json</code>. See <code class="inline">AUTHORING.md</code>.
    </div>
  </div>`));

  screen.appendChild(el(`<div class="center small faint" style="padding:8px 0 20px">
    Reps · local-first · no account, no server
  </div>`));

  root.appendChild(wrap);

  /* ---- helpers ---- */
  function numRow(title, hint, key, min, max) {
    const row = el(`<div class="setrow">
      <div class="grow"><div style="font-weight:650">${esc(title)}</div>
      <div class="small faint">${esc(hint)}</div></div></div>`);
    const input = el(`<input class="numinput" type="number" inputmode="numeric" min="${min}" max="${max}" value="${state.settings[key] ?? DEFAULT_SETTINGS[key]}">`);
    input.onchange = () => {
      const v = clamp(parseInt(input.value, 10) || DEFAULT_SETTINGS[key], min, max);
      input.value = String(v);
      setSetting(key, v);
    };
    row.appendChild(input);
    return row;
  }

  function toggleRow(title, hint, key) {
    const row = el(`<div class="setrow">
      <div class="grow"><div style="font-weight:650">${esc(title)}</div>
      <div class="small faint">${esc(hint)}</div></div></div>`);
    const sw = el(`<button class="switch ${state.settings[key] ? 'on' : ''}" type="button"><i></i></button>`);
    sw.onclick = () => { setSetting(key, !state.settings[key]); sw.classList.toggle('on', !!state.settings[key]); };
    row.appendChild(sw);
    return row;
  }
}
