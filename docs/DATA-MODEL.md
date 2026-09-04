# Data model

The runtime shapes: what the code sees after content is loaded, and what is
persisted.

For the *authoring* format — what you actually write in a JSON file — see
[AUTHORING.md](../AUTHORING.md). This document covers what happens to it
afterwards.

## Ids

Ids are built by joining path segments as content is indexed. They are the
primary key for progress, so they must be stable.

| Thing | Id | Example |
|---|---|---|
| pack | `<packId>` | `k8s-architecture` |
| unit | `<pack>/<unit>` | `k8s-architecture/rke2` |
| concept | `<pack>/<unit>/<concept>` | `k8s-architecture/rke2/rke2-join` |
| item | `<pack>/<unit>/<concept>/<item>` | `k8s-architecture/rke2/rke2-join/port-9345` |
| flow | `<pack>/<flow>` | `k8s-architecture/node-dies` |

The short id you write in JSON is kept as `shortId` on the object.

> Renaming any segment orphans the progress record underneath it. The old record
> is not deleted, it is simply never matched again — the item reads as new.

## The content index

`loadContent()` populates the exported `content` object. Everything else reads
from these; nothing re-fetches.

```js
content = {
  packs:      [pack],            // in packs.json order
  flows:      [flow],            // every flow, all packs
  items:      [item],            // every exercise, flattened
  byPack:     Map<packId, pack>,
  byUnit:     Map<unitId, unit>,
  byConcept:  Map<conceptId, concept>,
  byItem:     Map<itemId, item>,
  byFlow:     Map<flowId, flow>,
  problems:   [string],          // non-fatal content warnings, shown in Settings
}
```

Each loaded object gains fields the author never writes:

```js
pack    = { id, dir, title, subtitle, emoji, accent, description,
            units: [unit], flows: [flow], itemCount }
unit    = { id, shortId, packId, title, summary, index, concepts: [concept], itemCount }
concept = { id, shortId, packId, unitId, title, brief, examples, links, items: [item] }
item    = { ...authored fields, id, shortId, conceptId, unitId, packId }
flow    = { ...authored fields, id, shortId, packId, index, steps, askCount }
```

Loading is tolerant: a malformed item is reported into `content.problems` and
the rest of the pack still loads. `tools/validate.py` applies the same rules
strictly and fails the build, which is why CI runs it before deploying.

## Persisted state

One `localStorage` key, `ako.state.v1`, holding:

```js
{
  v: 1,
  settings: {
    dailyGoal: 12,       // answers per day to keep the streak
    newPerSession: 5,    // preferred new items to mix in (soft cap)
    sessionLength: 12,   // items per session
    linearPath: true,    // gate units behind the previous one
    theme: 'dark',
  },
  activePack: 'k8s-architecture',
  records:     { [itemId]: record },
  days:        { 'YYYY-MM-DD': { items, correct, xp, seconds } },
  conceptSeen: { [conceptId]: 'YYYY-MM-DD' },   // first time the brief was shown
  flows:       { [flowId]: { completed, runs, lastScore } },
  seenIntro:   false,
  createdAt:   'YYYY-MM-DD',
  lastOpen:    'YYYY-MM-DD',
}
```

Rules:

- **Everything is optional on read.** `load()` merges over a fresh `blank()`, so
  an older saved shape gains new fields with defaults. Adding a field needs no
  migration; renaming or changing the meaning of one does.
- **Writes are debounced 120ms** and go through `save()`. Never write the key
  directly.
- `state` is a plain mutable object. Mutate it only inside `store.js`, then call
  `touch()` (save + emit).
- Bump `SCHEMA` / the key name only for a breaking change, and then decide
  deliberately whether to migrate or reset.

### Days and derived stats

`days` is the only history kept. Streaks, XP and the activity heatmap are all
derived from it on read, so they self-heal if a day is edited or missing:

- `streak()` — walks backwards from today counting days where
  `items >= dailyGoal`. Today not being done yet does not break the streak.
- `totalXP()` — sums `xp` across all days.
- `history(n)` — the last `n` days padded with zeros, each with a `level` 0–4 for
  the heatmap.

A walkthrough prediction increments `days[today].items` via `answerFlowStep()`
but creates **no** record — walkthroughs are not scheduled.

## The SRS record

One per exercise item, created lazily on first answer.

```js
{
  box: 0,        // 0..MAX_BOX (7) — position on the Leitner ladder
  ease: 2.5,     // 1.3..2.8 multiplier on the interval
  due: 'YYYY-MM-DD',
  last: 'YYYY-MM-DD' | null,
  seen: 0,       // total answers
  right: 0,
  wrong: 0,
  lapses: 0,     // wrong answers after having reached box >= 1
  streak: 0,     // consecutive correct
}
```

`INTERVALS = [0, 1, 2, 4, 9, 18, 35, 70]` days, indexed by box.

`grade(rec, correct, firstTry)`:

- **correct** — `box + 1` (capped), ease ±0.06/−0.05, next due in
  `INTERVALS[box]` days scaled by `ease / 2.5` for boxes above 1
- **wrong** — ease −0.2, `box` drops to 1 (from ≥3) or 0, `lapses++`, due
  **today** so it returns this session and again tomorrow

### Derived strength

| Function | Meaning |
|---|---|
| `itemMastery(rec)` | 0–1 for one item: 75% box position, 25% lifetime accuracy |
| `groupMastery(items, records)` | mean item mastery — drives every progress bar |
| `masteryLevel(m, seenAny)` | 0–4 → `LEVELS` = New / Learning / Familiar / Strong / Mastered, at 0.3 / 0.55 / 0.8 |
| `weakness(items, records)` | ranking score from inaccuracy, lapses, overdue days and low box — drives "needs another look" |
| `stats(items, records)` | `{ total, due, new, seen, accuracy, mastery }` for any group |

All of these take the items and the record map explicitly, so they work on any
slice: one concept, one unit, a whole pack, or everything.

## Glossary

`content/glossary.json` is shared across packs.

```js
{
  terms:   { [term]: { short, concept?, auto? } },
  aliases: { [surface]: term },
}
```

- `short` — the one-line definition shown in the sheet
- `concept` — optional concept id; adds a "Read the full concept" button
- `auto: false` — defined but never auto-linked (for words that are also
  ordinary English: `requests`, `limits`, `watch`, `node`, `pod`, …)

At load these are compiled into a single regex sorted longest-first. See the
matching rules in [ARCHITECTURE.md](ARCHITECTURE.md#glossary).

## Backup format

Settings → Backup & restore exports `state` verbatim as JSON. `importJSON()`
requires a `records` key and merges over `blank()`, so a backup from an older
schema restores cleanly. This is the only way progress moves between devices —
there is no sync.
