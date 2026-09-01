import { $, el, esc } from './util.js';
import { loadContent, content } from './content.js';
import { state, applyTheme, save, setActivePack } from './store.js';
import { icons } from './components/icons.js';

import { renderHome } from './views/home.js';
import { renderSession } from './views/session.js';
import { renderProgress } from './views/progress.js';
import { renderLibrary, renderPack, renderUnit, renderConcept } from './views/library.js';
import { renderSettings } from './views/settings.js';

const app = $('#app');
const tabbar = $('#tabbar');

const TABS = [
  { href: '#/', icon: 'home', label: 'Today' },
  { href: '#/progress', icon: 'chart', label: 'Progress' },
  { href: '#/library', icon: 'book', label: 'Library' },
  { href: '#/settings', icon: 'gear', label: 'Settings' },
];

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function parseRoute() {
  const raw = (location.hash || '#/').slice(1);
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, params: new URLSearchParams(qs || '') };
}

function renderTabs(activeHref) {
  tabbar.innerHTML = TABS.map((t) => {
    const on = t.href === activeHref;
    return `<a href="${t.href}" class="${on ? 'active' : ''}">${icons[t.icon]}<span>${t.label}</span></a>`;
  }).join('');
}

export function render() {
  const { parts, params } = parseRoute();
  const head = parts[0] || '';

  app.innerHTML = '';
  app.classList.remove('is-fullscreen');
  tabbar.hidden = false;

  let tabHref = '#/';
  try {
    switch (head) {
      case '':
        renderHome(app);
        break;
      case 'session':
        app.classList.add('is-fullscreen');
        tabbar.hidden = true;
        renderSession(app, {
          mode: params.get('mode') || 'daily',
          unitId: params.get('unit') ? decodeURIComponent(params.get('unit')) : null,
          conceptId: params.get('concept') ? decodeURIComponent(params.get('concept')) : null,
          packId: params.get('pack') || state.activePack,
        });
        break;
      case 'progress':
        tabHref = '#/progress';
        renderProgress(app);
        break;
      case 'library':
        tabHref = '#/library';
        if (parts[1]) renderPack(app, decodeURIComponent(parts[1]));
        else renderLibrary(app);
        break;
      case 'unit':
        tabHref = '#/library';
        renderUnit(app, decodeURIComponent(parts[1] || ''));
        break;
      case 'concept':
        tabHref = '#/library';
        renderConcept(app, decodeURIComponent(parts[1] || ''));
        break;
      case 'settings':
        tabHref = '#/settings';
        renderSettings(app);
        break;
      default:
        app.appendChild(el('<div class="empty"><div class="big">🤷</div>Nothing here.</div>'));
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="screen"><div class="card"><h2>Something broke</h2>
      <pre class="code">${esc(e.stack || e.message)}</pre></div></div>`;
  }

  renderTabs(tabHref);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { render(); });
window.addEventListener('reps:render', () => { render(); });

async function boot() {
  applyTheme();
  try {
    await loadContent();
  } catch (e) {
    app.innerHTML = `<div class="screen" style="padding-top:60px"><div class="card">
      <h2>Content failed to load</h2>
      <p class="muted small">Reps reads its lessons from <code class="inline">/content</code> over HTTP.
      Open the app through a web server (see the README) rather than as a <code class="inline">file://</code> path.</p>
      <pre class="code">${esc(e.message)}</pre></div></div>`;
    return;
  }
  if (!state.activePack || !content.byPack.has(state.activePack)) {
    setActivePack(content.packs[0]?.id || null);
  }
  save();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch(() => {});
  }
}

boot();
