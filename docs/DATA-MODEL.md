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
    sound: true,         // feedback cues
    tapSound: false,     // click on every choice
  },
  activePack: 'k8s-architecture',
  records:     { [itemId]: record },
  days:        { 'YYYY-MM-DD': { items, correct, seconds } },
  conceptSeen: { [conceptId]: 'YYYY-MM-DD' },   // first time the brief was shown
  flows:       { [flowId]: { completed, runs, lastScore } },
  seenIntro:   false,
  streakCelebratedOn: 'YYYY-MM-DD' | null,   // so the streak screen fires once a day
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

`days` is the only history kept. Streaks, days practiced and the heatmap are all
derived from it on read, so they self-heal if a day is edited or missing:

- `streak()` — walks backwards from today counting days where
  `items >= dailyGoal`. Today not being done yet does not break the streak.
- `daysPracticed()` — how many days ever hit the goal. Replaced XP, which
  counted answers without meaning anything.
- `history(n)` — the last `n` days padded with zeros, each with a `level` 0–4 for
  the heatmap.

A walkthrough prediction increments `days[today].items` via `answerFlowStep()`
but creates **no** record — walkthroughs are not scheduled.

## The scheduling record

One per exercise item, created lazily on first answer.

```js
{
  s: 4.6,        // stability: days until recall would fall to ~90%
  d: 0.3,        // difficulty 0.05..0.95 — how hard this has proven for you
  due: 'YYYY-MM-DD',
  last: 'YYYY-MM-DD' | null,
  seen: 0, right: 0, wrong: 0,
  lapses: 0,     // times forgotten after having been learned
  streak: 0,     // consecutive correct
}
```

### The curve

`R(t) = 0.9 ^ (t / s)` — recall probability `t` days after the last review.
Stability is defined so that `R(s) = 0.9` exactly, which makes `s` directly
readable as *"good for about this many days"*. An item is due when `R` would
drop below 0.9, i.e. `due = last + round(s)`.

### `grade(rec, correct, { firstTry })`

**Correct, first try, previously seen** — stability multiplies by
`ease x spacing x taper`:

| Term | Value | Why |
|---|---|---|
| ease | `2.6 − 1.4·d` | items that have proven hard grow slower |
| spacing | `1 + 1.2·(1 − R)` | reviewing late, when recall had decayed, is worth more |
| taper | `(1 + s)^−0.08` | diminishing returns so intervals do not run away |

Clamped to `[1.2, 5]`. Returning exactly when due (`R = 0.9`) more than doubles
the interval each time, so a well-known item runs about **1 → 2.4 → 5.7 → 13 →
29 → 63 → 128 → 246** days — a shade more conservative than Anki's defaults.
Reviewing early, with recall still at 1.0, grows slower: 1 → 2.2 → 4.6 → 9.7 →
20 → 39 → 73 → 132.

**Correct on a relearning attempt** (`firstTry: false`) — only `×1.15`. Getting
something right a few questions after being shown the answer is not evidence it
will still be there tomorrow.

**Wrong** — `s = min(s × 0.25, 5) × (1 − 0.4·d)`, `d += 0.15`, `lapses++`. The
absolute cap matters: something you just failed comes back within days however
long it had been holding. Difficulty ratchets up and only creeps back down,
which is what eventually surfaces a leech (`lapses >= 6`).

### Derived measures

Three deliberately separate questions — collapsing them into one "mastery %" is
what made the old progress screen uninformative:

| Function | Question it answers |
|---|---|
| `coverage(items, records)` | how much of this have I ever met? |
| `retention(items, records)` | of what I have met, how much do I still hold? |
| `recall(items, records)` | of the whole thing, how much could I produce today? |
| `strength(rec)` / `groupStrength` | how *durably* is this known, ignoring when it was last seen |
| `weakness(items, records)` | ranking for "weakest right now" |
| `stats(items, records)` | all of the above plus `due`, `new`, `seen`, `leeches`, `accuracy` |

`recall` is `coverage × retention` and is the headline number on the progress
screen. `strength` is what the mastery dots and level names use, because it does
not swing every time you happen to review something.

### Migration

`migrateRecord()` converts pre-forgetting-curve records (`box` + `ease`) by
seeding stability from the old interval ladder and difficulty from accuracy and
lapses, then deleting the old fields. It runs on load and on backup import, so
no one loses history.

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
