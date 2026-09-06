import { el, esc, toast, today, clamp } from '../util.js';
import { content } from '../content.js';
import { state, setSetting, exportJSON, importJSON, resetProgress, DEFAULT_SETTINGS } from '../store.js';
import { currentBuild, updatePending, checkForUpdate } from '../update.js';
import { howItWorksHTML } from './home.js';
import { preview, audioAvailable } from '../sound.js';
import { celebrateStreak } from '../components/celebrate.js';

export function renderSettings(root) {
  const wrap = el(`<div class="fade">
    <div class="topbar"><h1>Settings</h1></div>
    <div class="screen"></div>
  </div>`);
  const screen = wrap.querySelector('.screen');

  /* ---- how this works ---- */
  screen.appendChild(el(`<div class="card">
    <div class="tiny" style="margin-bottom:8px">How this works</div>
    ${howItWorksHTML()}
  </div>`));

  /* ---- daily practice ---- */
  const practice = el('<div class="card"><div class="tiny" style="margin-bottom:4px">Daily practice</div></div>');
  practice.appendChild(numRow('Daily goal', 'Exercises per day needed to keep the streak.', 'dailyGoal', 3, 60));
  practice.appendChild(numRow('Session length', 'Exercises in one session.', 'sessionLength', 4, 40));
  practice.appendChild(numRow('New per session', 'How much brand-new material to mix in. More is used when nothing is due.', 'newPerSession', 0, 20));
  practice.appendChild(toggleRow('Guided path', 'Unlock units in order instead of mixing everything.', 'linearPath'));
  screen.appendChild(practice);

  /* ---- sound ---- */
  const sound = el('<div class="card"><div class="tiny" style="margin-bottom:4px">Sound</div></div>');
  sound.appendChild(toggleRow('Sound effects', 'Short cues on answers, sessions and streaks.', 'sound'));
  sound.appendChild(toggleRow('Click on every answer', 'A tick when you pick an option. Off by default.', 'tapSound'));
  sound.appendChild(el(`<div class="small faint" style="padding:10px 0 8px">
    ${audioAvailable()
      ? 'Tap a cue to hear it. On iPhone these follow the silent switch.'
      : 'This browser has no Web Audio support, so cues are silent here.'}
  </div>`));
  const cues = el('<div class="row wrap" style="gap:8px"></div>');
  [['correct', 'Correct'], ['wrong', 'Wrong'], ['correctAgain', 'Second look'],
   ['predictWrong', 'Prediction miss'], ['complete', 'Session done'],
   ['goal', 'Daily goal'], ['streak', 'Streak'], ['mastered', 'Mastered']
  ].forEach(([cue, label]) => {
    const b = el(`<button class="chip" type="button">${esc(label)}</button>`);
    b.onclick = () => preview(cue);
    cues.appendChild(b);
  });
  sound.appendChild(cues);
  const seeStreak = el('<button class="btn ghost sm" style="width:100%;margin-top:12px" type="button">Preview the streak screen</button>');
  seeStreak.onclick = () => celebrateStreak();
  sound.appendChild(seeStreak);
  screen.appendChild(sound);

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

  /* ---- offline install status ---- */
  const offline = el(`<div class="card">
    <div class="tiny" style="margin-bottom:8px">Offline install</div>
    <div class="small muted" style="margin-bottom:10px">
      Whether this device can run Ako with no network and no laptop.
    </div>
    <div class="statuslist"></div>
    <div class="btn-row" style="margin-top:12px"></div>
  </div>`);
  const statusList = offline.querySelector('.statuslist');
  const offlineRow = offline.querySelector('.btn-row');

  const recheck = el('<button class="btn secondary sm" style="flex:1" type="button">Check again</button>');
  recheck.onclick = () => paintOfflineStatus(statusList);

  // An installed phone runs its cached copy until a newer worker arrives, so
  // "am I on the latest?" needs an answer here rather than a guess.
  const upd = el('<button class="btn secondary sm" style="flex:1" type="button">Check for update</button>');
  upd.onclick = async () => {
    upd.disabled = true;
    upd.textContent = 'Checking…';
    const checked = await checkForUpdate();
    // installing -> activating -> controllerchange takes a beat to settle
    await new Promise((r) => setTimeout(r, 1200));
    upd.disabled = false;
    upd.textContent = 'Check for update';
    // Never say "up to date" on a check that did not happen - offline, or no
    // registration at all. Saying it anyway is the failure this card exists
    // to prevent.
    toast(!checked ? 'Could not check — no connection'
      : updatePending() ? 'Update installed — reopen Ako'
      : 'No new build found');
    paintOfflineStatus(statusList);
  };
  offlineRow.append(recheck, upd);
  paintOfflineStatus(statusList);
  screen.appendChild(offline);

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
    a.download = `ako-backup-${today()}.json`;
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
      window.dispatchEvent(new CustomEvent('ako:render'));
    } catch (e) {
      toast(`Import failed: ${e.message}`);
    }
  };
  const wipe = el('<button class="btn ghost sm" style="flex:1" type="button">Reset progress</button>');
  wipe.onclick = () => {
    if (confirm('Erase all answers, streaks and scheduling? Settings are kept.')) {
      resetProgress();
      toast('Progress cleared');
      window.dispatchEvent(new CustomEvent('ako:render'));
    }
  };
  bottomRow.append(restore, wipe);
  screen.appendChild(backup);

  /* ---- content ---- */
  const packs = content.packs.map((p) =>
    `${p.emoji} ${p.title}\n   ${p.units.length} units · ${p.itemCount} exercises · ${p.flows.length} walkthroughs`
  ).join('\n');
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
    <b style="color:var(--fg-dim)">ako</b> — Māori: to teach and to learn, one word for both<br>
    local-first · no account, no server
  </div>`));

  root.appendChild(wrap);

  /* ---- helpers ---- */

  /**
   * Answers "is this phone actually independent yet?" on the device itself,
   * rather than making you guess from the other end.
   */
  async function paintOfflineStatus(host) {
    host.innerHTML = '<div class="small faint">checking…</div>';

    const secure = window.isSecureContext;
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    let swState = 'unsupported';
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        swState = reg ? (reg.active ? 'active' : 'installing') : 'none';
      } catch { swState = 'none'; }
    }

    let cached = 0;
    if ('caches' in window) {
      try {
        for (const name of await caches.keys()) {
          cached += (await (await caches.open(name)).keys()).length;
        }
      } catch { /* storage blocked */ }
    }

    const rows = [
      [secure, secure ? 'Served securely (HTTPS or localhost)' : 'Not a secure origin — offline install is blocked here',
        secure ? null : 'Host it over HTTPS. See DEPLOY.md.'],
      [swState === 'active', swState === 'active' ? 'Service worker running' :
        swState === 'installing' ? 'Service worker installing — reopen the app' :
        swState === 'unsupported' ? 'This browser has no service worker support' : 'No service worker registered',
        swState === 'none' && secure ? 'Reload once with a connection.' : null],
      [cached > 0, cached > 0 ? `${cached} files cached on this device` : 'Nothing cached yet',
        cached > 0 ? null : 'Open a session once while online.'],
      [standalone, standalone ? 'Running as an installed app' : 'Running in the browser',
        standalone ? null : 'Use "Add to Home Screen" for the full-screen app.'],
    ];

    // "running" is knowable; "latest" is not - the page cannot see the server.
    const { controlled, build } = await currentBuild();
    if (updatePending()) {
      rows.push([false, 'A newer build is installed but not in use',
        'Fully close Ako and open it again. Reloading the tab is not enough.']);
    } else if (controlled && build) {
      rows.push([true, `Running build ${build}`, null]);
    } else if (controlled) {
      // A worker from before builds were stamped: it has no version to report,
      // which is exactly what a device stuck on the old cache looks like.
      rows.push([false, 'Running an older worker that cannot report its build',
        'Tap "Check for update", then fully close and reopen Ako.']);
    }

    const ready = secure && swState === 'active' && cached > 0;
    host.innerHTML =
      rows.map(([ok, label, hint]) => `
        <div class="setrow" style="align-items:flex-start;gap:10px">
          <span class="dot ${ok ? 'm4' : 'm2'}" style="margin-top:6px"></span>
          <div class="grow">
            <div style="font-weight:600;font-size:14px">${esc(label)}</div>
            ${hint ? `<div class="small faint">${esc(hint)}</div>` : ''}
          </div>
        </div>`).join('') +
      `<div class="small" style="margin-top:10px;color:${ready ? 'var(--good)' : 'var(--fg-dim)'}">
        ${ready
          ? 'This device can run Ako with no network. Try airplane mode.'
          : 'Not fully offline yet — see DEPLOY.md.'}
      </div>`;
  }

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
