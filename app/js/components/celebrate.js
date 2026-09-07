// The streak-extended moment: shown once on the first session of the day that
// reaches the daily goal.
//
// It earns a full screen because it is the only moment in the app that is purely
// a reward — everything else is either teaching or testing. It is also the thing
// that gets someone to open the app tomorrow.

import { el, esc, today, addDays } from '../util.js';
import { state, streak, history, markStreakCelebrated } from '../store.js';
import { play } from '../sound.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The last seven days ending today, rather than the calendar week — on a
 * Monday a calendar week shows one filled dot no matter how long the run is,
 * which undercuts the whole point of the screen.
 */
function lastSevenDays() {
  const days = new Map(history(30).map((h) => [h.key, h]));
  const goal = state.settings.dailyGoal;
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today(), i - 6);
    const [y, m, d] = key.split('-').map(Number);
    return {
      label: DOW[new Date(y, m - 1, d).getDay()],
      key,
      done: (days.get(key)?.items || 0) >= goal,
      isToday: i === 6,
      future: false,
    };
  });
}

/**
 * Show the celebration over whatever is on screen, then call `done`.
 *
 * `preview` is for the Settings button, which shows the screen on demand. A
 * preview must not mark the day as celebrated: doing so consumed the real
 * moment, so anyone who looked at the screen out of curiosity was never shown
 * it when they actually earned it that day.
 *
 * Pass `preview` only with a no-op `done`. A preview leaves the day unmarked,
 * so a `done` that re-checks `streakCelebrationDue()` — which is what the
 * session and walkthrough `finish()` do — would show the screen again forever.
 */
export function celebrateStreak(done = () => {}, { preview = false } = {}) {
  const s = streak();
  const week = lastSevenDays();

  const wrap = el(`<div class="celebrate">
    <div class="celebrate-glow"></div>
    <div class="celebrate-body">
      <div class="celebrate-flame">🔥</div>
      <div class="celebrate-count"><span class="from">${Math.max(0, s.current - 1)}</span></div>
      <div class="celebrate-label">day streak</div>
      <div class="celebrate-sub">${esc(
        s.current === 1 ? 'First day. The hard one.'
        : s.current === 2 ? 'Two in a row.'
        : s.current % 7 === 0 ? `${s.current / 7} full weeks.`
        : s.current >= s.longest && s.longest > 1 ? 'Your best run yet.'
        : 'Streak extended.'
      )}</div>
      <div class="celebrate-week"></div>
    </div>
  </div>`);

  const weekEl = wrap.querySelector('.celebrate-week');
  week.forEach((d) => {
    weekEl.appendChild(el(`<div class="cday ${d.done ? 'done' : ''} ${d.isToday ? 'now' : ''} ${d.future ? 'future' : ''}">
      <span class="cday-dot">${d.done ? '✓' : ''}</span>
      <span class="cday-label">${d.label}</span>
    </div>`));
  });

  const foot = el('<div class="celebrate-foot"><button class="btn" type="button">Keep going</button></div>');
  wrap.appendChild(foot);

  document.body.appendChild(wrap);
  // Marked only once the screen is actually up, and never for a preview. If
  // this ran before the DOM went in, a render failure would silently spend the
  // day's celebration without anyone seeing it.
  if (!preview) markStreakCelebrated();
  play('streak');

  // count ticks up a beat after the flame lands, so the two do not compete
  const countEl = wrap.querySelector('.celebrate-count');
  setTimeout(() => {
    countEl.innerHTML = `<span class="to">${s.current}</span>`;
    countEl.classList.add('bumped');
  }, 420);

  const finish = () => { wrap.remove(); done(); };
  foot.querySelector('button').onclick = finish;
  return true;
}
