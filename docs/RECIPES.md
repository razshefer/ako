# Recipes

Step-by-step for the changes that actually come up. Each one lists every file
you have to touch, so nothing is missed.

Read [ARCHITECTURE.md](ARCHITECTURE.md) first if you have not.

---

## Add a new exercise type

Say you want `predict` — show a command, type what it outputs.

1. **`app/js/components/exercise.js`** — write a factory returning the standard
   contract:

   ```js
   function predict(item, onChange) {
     const node = el(`<div>${questionHead(item)} …</div>`);
     // call onChange() whenever the answer becomes (un)ready
     return {
       node,
       focus: () => …,        // optional; called for keyboard-first widgets
       ready: () => …,        // enough input to enable Check?
       check: () => ({ correct, answerHTML }),  // also paints ok/no state
     };
   }
   ```

   Register it in `FACTORIES` at the bottom of the file.

2. **`app/js/content.js`** — add the name to `ITEM_TYPES` and a `case` in
   `validateItem()` for its required fields.

3. **`tools/validate.py`** — add it to `TYPES` and to `check_item()`. Keep the
   two validators in step; CI runs the Python one.

4. **`app/css/style.css`** — styles for the widget, near the other exercise
   blocks.

5. **`AUTHORING.md`** — document the JSON shape with an example.

Notes: if the widget completes on its own (like `match`), `views/session.js`
polls `ready()` and auto-submits — see the `autoCheck` branch. Anything the
widget renders as prose should use `mdInline()`, not `md()`.

---

## Add a new screen

1. **`app/js/views/yourview.js`** — export one `renderYourView(root, arg)` that
   appends DOM to `root`. Follow an existing view; use `shell()` in `library.js`
   as the pattern for a back-arrow header.
2. **`app/js/main.js`** — import it, add a `case` to the `switch` in `render()`,
   and set `tabHref` so the right tab highlights. For a full-screen activity,
   also `app.classList.add('is-fullscreen')` and `tabbar.hidden = true`.
3. Link to it from somewhere with `location.hash = '#/yourroute'`.
   `encodeURIComponent` any id that contains `/`.

If the screen shows prose that should carry term definitions, give its container
one of the classes in `GLOSSIFY_SELECTOR`, or add a new one.

---

## Add a setting

1. **`app/js/store.js`** — add the field with its default to `DEFAULT_SETTINGS`.
   Nothing else; `load()` merges over defaults, so old saves pick it up.
2. **`app/js/views/settings.js`** — add a row using the `numRow()` or
   `toggleRow()` helper at the bottom of the file.
3. Read it as `state.settings.yourField` wherever it applies.

Only call `setSetting()` to change one — it persists and re-applies the theme.

---

## Change the scheduling

All of it is in **`app/js/srs.js`**, and it is pure — no state, no DOM.

- Interval ladder → `INTERVALS` and `MAX_BOX`
- Promotion, demotion, ease → `grade()`
- What "mastered" means → `itemMastery()`, `masteryLevel()` thresholds
- What surfaces in "needs another look" → `weakness()`

What goes *into* a session is a different question and lives in
`app/js/session.js` (`buildQueue`). Changing the mix of due versus new material
belongs there, not in `srs.js`.

Existing records keep their `box` and `due`, so a change to the ladder takes
effect on the next answer rather than retroactively.

---

## Add or retune a sound

All cues live in the `CUES` map in `app/js/sound.js`. A cue is a function that
schedules notes; `note(freq, {at, dur, gain, type, slideTo})` does the work.

1. Add an entry to `CUES`. Keep it under ~300ms and under `gain: 1`.
2. Call `play('yourCue')` from the moment it belongs to.
3. Add it to the preview list in `views/settings.js` so it can be auditioned
   without replaying a whole session.

Rules of thumb that keep this pleasant on the hundredth session: rising
intervals read as good and falling as bad, `triangle` is warm while `square` is
harsh, and anything that fires on *every* answer needs to be quieter than you
think. If a cue can fire twice within a second, it is too long.

To check a cue actually schedules what you meant, wrap `createOscillator` and
log the frequencies — see the note in the sound section of ARCHITECTURE.md.

---

## Add a walkthrough

1. Write `content/<pack>/flows/<nn>-<slug>.json` — see the shape and the writing
   guidelines in [AUTHORING.md](../AUTHORING.md#walkthroughs).
2. Add its filename to the `flows` array in `content/<pack>/pack.json`.
3. `python tools/validate.py` — it checks step structure, `ask` indexes, and that
   every id in `concepts` resolves.

No code changes. It appears on Home, in the Library and on Progress
automatically.

---

## Add a subject (pack)

1. `content/<pack>/pack.json`, `units/*.json`, optionally `flows/*.json`
2. Add the directory name to `content/packs.json`
3. Validate

Also no code changes. Multi-pack UI (the switcher on Home, per-pack sections in
Library and Progress) already exists but is only visible once a second pack is
installed — worth clicking through when you add one.

---

## Add glossary terms

Edit `content/glossary.json`. Keep `short` to one or two plain sentences and do
not define jargon with more jargon. Add plurals and short forms to `aliases`.

If a term is also an ordinary English word, set `"auto": false` so it stays
defined but stops auto-linking — otherwise it lights up in unrelated prose.

Check your work by loading a page that uses the term and confirming exactly one
dotted underline in each block.

---

## Add something to Progress

`app/js/views/progress.js` is a linear sequence of cards. Insert a new one where
it belongs and build it from the same primitives:

- `stats(items, state.records)` for any group of items
- `groupMastery` / `masteryLevel` for strength
- `bar()`, `levelDot()`, `stat()` from `components/bits.js`
- `history(n)` from the store for anything time-series

Prefer deriving from `state.days` and `state.records` over storing a new
counter. Derived numbers cannot drift.

---

## Change how the app looks

Everything is in `app/css/style.css`, which is plain CSS with custom properties
at the top. There is no framework and no preprocessor.

- Colours: the token block at `:root`, with a `[data-theme="light"]` override.
  **Always add a token to both**, or light mode breaks.
- The file is ordered: tokens → shell → generic → screens → components.
- Test at 375×812. Tap targets are `--tap` (44px) minimum.

---

## Debug checklist

**Blank screen** — check the console. `render()` catches renderer exceptions and
prints the stack into the page, so a blank screen usually means the failure was
in boot instead.

**Content not appearing** — hard-reload. The service worker serves `/content/`
network-first, but a stale shell can still be cached; in DevTools use
Application → Service Workers → Unregister, or fully close the installed app.

**"Content failed to load"** — the page is on `file://`. Use `python serve.py`.

**Progress not saving** — writes are debounced 120ms; read `state` rather than
`localStorage` right after a mutation.

**An answer is always in the same position** — someone seeded `shuffle()`. It
must be called with one argument.

**A term is not linking** — is its container in `GLOSSIFY_SELECTOR`? Is it inside
`code`/`pre`/`button`? Is it a second mention in the same block? Is it
`auto: false`? Is the capitalisation exactly right for a capitalised term?

**Offline not working** — Settings → Offline install names the failing
precondition. Almost always a non-HTTPS origin.

---

## Before you commit

```bash
python tools/validate.py
```

```bash
python serve.py
```

Click through the screens you touched at a phone viewport. Then commit with a
message that says why, not what.
