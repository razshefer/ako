# Architecture

How Ako is put together, and the traps that are not obvious from reading the
code.

## The shape of it

A static site with three layers that never blur into each other:

| Layer | Where it lives | Mutability |
|---|---|---|
| **Content** — packs, units, concepts, exercises, walkthroughs, glossary | JSON under `content/`, fetched at boot, indexed into `content.*` | read-only at runtime |
| **Progress** — what you have answered and when it is due | `localStorage` key `ako.state.v1`, held in `state` | mutated only through `store.js` |
| **View** — what is on screen right now | DOM, rebuilt per route | thrown away on every render |

Everything else follows from that split. Views read content and progress and
write nothing directly; only `store.js` touches persisted state.

## Boot

`index.html` loads one module, `app/js/main.js`, which:

1. `applyTheme()` — sets `data-theme` from saved settings before first paint
2. `installGlossaryHandler()` — one delegated click listener for all `.gloss`
   buttons, for the life of the page
3. `await Promise.all([loadContent(), loadGlossary()])` — fetches and indexes
   everything under `content/`
4. picks a default `activePack` if none is set
5. `render()` — draws the current hash route
6. registers `sw.js` (best-effort; silently skipped on non-secure origins)

If step 3 throws, the app replaces itself with a "content failed to load"
screen. That is the expected state when someone opens `index.html` from
`file://` — ES modules and `fetch` both need HTTP.

## Modules

### Core

| File | Owns |
|---|---|
| `main.js` | routing, the render lifecycle, boot |
| `store.js` | persisted state, every mutation, derived stats (streak, XP, history) |
| `srs.js` | the scheduling algorithm and all mastery maths — pure functions, no state |
| `content.js` | fetching and indexing packs into lookup maps |
| `session.js` | building a practice queue and tracking a run through it |
| `glossary.js` | term matching, DOM linking, the definition sheet |
| `util.js` | DOM helpers, markdown-lite, code rendering, dates, shuffle |

`srs.js` is deliberately pure: it takes a record and returns a record. If you
need new scheduling behaviour, it belongs there and nowhere else.

### Views — one per route, each exports one `render*` function

`home.js`, `session.js`, `progress.js`, `library.js` (four renderers),
`settings.js`, `flow.js`.

A view's contract: take a root element, append DOM to it, wire its own
listeners. It is never asked to clean up — `render()` discards the tree.

### Components

| File | Owns |
|---|---|
| `exercise.js` | the five exercise widgets; the only place answer-checking logic lives |
| `conceptsheet.js` | full-screen concept overlay used from inside sessions and walkthroughs |
| `bits.js` | small render helpers (progress ring, bars, mastery dots, stat tiles) |
| `icons.js` | inline SVG paths, `viewBox` only |

### Dependency rule

```
util  ←  srs  ←  store  ←  session
  ↑       ↑        ↑         ↑
  └───── content ──┴─── views ┘
```

Views may import anything. Nothing below `views/` may import a view — with one
deliberate exception: `library.js` and `settings.js` import `flowRow` and
`howItWorksHTML` from `home.js`, because those are shared presentation snippets.
If a third view needs one, move it to `components/bits.js` instead of adding
another view-to-view import.

## Routing and the render lifecycle

Hash-based, because it must work on static hosting with no rewrites.

| Route | Renders |
|---|---|
| `#/` | home |
| `#/session?mode=…&pack=…&unit=…&concept=…` | a practice run |
| `#/flow/<packId>/<flowId>` | a walkthrough |
| `#/progress` | progress |
| `#/library`, `#/library/<packId>`, `#/unit/<unitId>`, `#/concept/<conceptId>` | library |
| `#/settings` | settings |

Ids contain `/`, so they are `encodeURIComponent`-ed into the hash and decoded
in `main.js`.

`render()` is a **full teardown and rebuild**: it clears any overlay, empties
`#app`, calls one renderer, repaints the tab bar, runs `glossify(app)`, and
scrolls to top. There is no diffing and no component state that survives.

Two ways to trigger it:

- change `location.hash` → `hashchange` → `render()`
- `window.dispatchEvent(new CustomEvent('ako:render'))` → re-render the *current*
  route, for when state changed but the URL did not (dismissing the intro card,
  switching packs, restoring a backup)

**Overlays live outside the router.** `conceptSheet()` and `showTerm()` append to
`document.body`, not `#app`, and do not touch the hash. That is what lets you
read an explanation mid-question and come back to the same question. `render()`
closes both, so a real navigation still cleans up.

## Session engine

`buildQueue(opts)` in `session.js` returns an ordered array of items. Modes:

| Mode | Pool | Ordering |
|---|---|---|
| `daily` | unlocked units of the active pack | due reviews first, capped new material interleaved, then weakest seen, then more new to fill |
| `unit` | one unit | due, then new, then weakest — fills the whole session |
| `concept` | one concept | shuffled |
| `weak` | seen items in the pack | lowest mastery first |
| `pack` | all units regardless of lock | same as daily |

`createRun(items)` wraps the queue in a small state machine: `current`, `submit`,
`next`, `finish`. Its one behavioural rule is that a missed item is pushed to the
back of the queue once, so a session cannot end on a wrong answer. Retries are
tracked so they are recorded with `firstTry: false` and do not double-count
toward the daily goal.

Unit gating (`unitUnlocked`) is a soft rule: a unit opens once **70% of the
previous unit's items have been seen at least once**, not on mastery. It can be
switched off entirely in Settings.

## Walkthroughs

`views/flow.js` is a small player, not a variant of the session engine. It walks
`flow.steps` in order, and for a step carrying an `ask` it shows the prediction
**before** the step body, then reveals. Predictions call `answerFlowStep()` so
they count toward the daily goal, but they are **not** SRS items and never enter
`state.records` — a walkthrough is a lesson, not a review.

## Glossary

`loadGlossary()` builds one big alternation regex from every auto-linkable term
and alias, sorted longest-first so `kube-apiserver` wins over `apiserver`.

`glossify(root)` finds containers matching `GLOSSIFY_SELECTOR` and, for each,
walks text nodes with a `TreeWalker`, skipping anything inside `SKIP_ANCESTORS`
(code, links, buttons, chips). Matches become `<button class="gloss">`.

Three rules worth knowing before you debug a mis-link:

- **first mention only**, per container, per pass
- containers are marked `data-glossed="1"` so a second `glossify` pass is a no-op
- a term containing a capital letter matches case-sensitively (`Service` ≠
  `service`); all-lowercase terms match case-insensitively

Terms that are also ordinary English carry `"auto": false` — defined, but never
auto-linked.

## Offline

`sw.js` caches the app shell **cache-first** and anything under `/content/`
**network-first**, so edited packs appear without bumping `VERSION`. Bump
`VERSION` (`ako-v1`) only when the shell file list changes.

The service worker sits at the repo root so its scope covers the whole app; it
is registered from `main.js` via `new URL('../../sw.js', import.meta.url)`.
Moving it into `app/` would silently reduce its scope to `/app/` and break
offline mode.

Settings has an "Offline install" card that reports secure-context, service
worker state, cached file count and standalone mode. That is the diagnostic to
point someone at when "it does not work offline".

## Traps that cost time

These are all real bugs that happened here. Do not reintroduce them.

- **`hidden` loses to `display:flex`.** The tab bar needs an explicit
  `.tabbar[hidden]{display:none}` rule. Setting the attribute alone does nothing
  against a class that sets display.
- **Inline SVGs have no intrinsic size.** Icons carry only a `viewBox`, so every
  context that renders one needs a CSS size rule (`.chip svg`, `.chev svg`, …).
  Without it they render at 0×0 and vanish silently.
- **Do not seed `shuffle()`.** Seeding from an item id makes answer positions
  stable across reviews, which lets you memorize positions instead of answers.
- **Scroll restoration across a full re-render is worse than none.** An earlier
  attempt recorded scroll under the *new* route key during navigation and left
  screens blank. `render()` scrolls to top, deliberately.
- **`md()` wraps in `<p>`.** Use `mdInline()` for anything that sits inside a
  line, or you get stray block breaks in choices and answer text.
- **`localStorage` writes are debounced 120ms.** Reading the key immediately
  after a mutation in a test will show stale data. Wait, or read `state`.
- **Absolute paths break the subpath deploy.** See CLAUDE.md constraint 3.

## Where features live

| Feature | Files |
|---|---|
| Scheduling, intervals, mastery | `srs.js` |
| What goes into a session | `session.js` |
| Answer widgets and checking | `components/exercise.js` |
| Streak, XP, daily goal | `store.js` (`streak`, `totalXP`, `todayStats`) |
| Progress charts, weak spots | `views/progress.js` |
| Walkthrough player | `views/flow.js` |
| Term definitions | `glossary.js` + `content/glossary.json` |
| Onboarding copy | `howItWorksHTML()` in `views/home.js` |
| Offline behaviour | `sw.js`, status card in `views/settings.js` |
| Theming | CSS custom properties at the top of `app/css/style.css` |
