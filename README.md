# Ako

*Māori: to teach and to learn — one word, with no distinction between the two.*

Duolingo-style drilling for technical subjects, built to be used on a phone in
five-minute sessions. Ships with a **Kubernetes Architecture** pack written
around RKE2 and Rancher: 157 exercises and 7 end-to-end walkthroughs.

- **Two ways to learn.** *Practice* drills you with spaced repetition; a
  *walkthrough* traces one real sequence end to end — a deploy, a node dying, a
  request finding a pod — asking you to predict each step before it is revealed.
- **Tap any underlined term** for a one-line plain-English definition, without
  leaving the question.
- Short daily sessions, streaks, a daily goal and XP
- Practical first: every concept leads with real YAML, commands and log output
- Progress per unit and per concept, with a "needs another look" list
- Any subject can be added by dropping a folder in `content/`
- Installable as a PWA and works offline
- **No build step, no npm, no account, no server** — plain ES modules and JSON

## Using it

Open it and press **Practice**. There is nothing to read first — the first time a
concept comes up you get a short explanation with real commands, then questions
on it. The Library is reference, not homework.

If you prefer seeing how things interact, start with a **walkthrough** instead.

## Putting it on your phone

See **[DEPLOY.md](DEPLOY.md)**. Short version: push to GitHub and turn on Pages
(the workflow in `.github/workflows/pages.yml` validates and publishes), then
open the URL on your phone and *Add to Home Screen*. After that it works offline
and does not need your laptop.

## Running it locally

There is nothing to compile. You just need to serve the folder over HTTP
(ES modules and `fetch` do not work from `file://`).

```bash
python serve.py
```

That prints two URLs:

```
this machine : http://localhost:8080/
your phone   : http://192.168.1.42:8080/
```

Open the phone URL while on the same Wi-Fi, then **Add to Home Screen**
(Chrome: ⋮ → Add to Home screen; Safari: Share → Add to Home Screen). It
launches full-screen with no browser chrome and keeps working offline.

Any static file server works — `npx serve`, nginx, Caddy, GitHub Pages, an S3
bucket. The app is entirely client-side.

> Note: iOS only allows service-worker installs over HTTPS or `localhost`, so
> offline mode on an iPhone needs the app hosted behind TLS. Android is happy
> with plain HTTP on a LAN address.

## Where progress lives

In `localStorage`, in that browser, on that device. Nothing is uploaded
anywhere.

That means: **export a backup before clearing site data**, and if you want the
same progress on laptop and phone, move it by hand.
Settings → Backup & restore → *Download backup* / *Restore from box*.

## Layout

```
index.html              app shell
sw.js                   service worker (offline cache)
serve.py                dev server, prints a LAN URL for your phone
app/
  css/style.css
  js/
    main.js             router + boot
    store.js            persisted state (localStorage)
    srs.js              spaced repetition: boxes, intervals, mastery
    session.js          queue building and the run state machine
    content.js          loads and indexes content packs
    glossary.js         tap-to-define terms
    components/         exercise widgets, concept overlay, icons, helpers
    views/              home, session, flow, progress, library, settings
content/
  packs.json            list of installed packs
  glossary.json         term -> one-line definition
  k8s-architecture/
    pack.json           title, emoji, unit and walkthrough order
    units/*.json        concepts + exercises
    flows/*.json        walkthroughs
tools/
  validate.py           check content before committing
  make_icons.py         regenerate the PWA icons
```

## Adding a subject

See [AUTHORING.md](AUTHORING.md). Short version: copy a unit file, edit the
JSON, register the pack in `content/packs.json`, run `python tools/validate.py`.
No rebuild — reload the page.

## Working on the code

| Doc | For |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Start here. Constraints, house rules, the verify loop. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it fits together, and the traps that cost time. |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Runtime shapes, the id scheme, the SRS record. |
| [docs/RECIPES.md](docs/RECIPES.md) | Step-by-step for common changes. |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Branching, review and releasing through a PR. |
| [AUTHORING.md](AUTHORING.md) | Writing content: exercises, walkthroughs, glossary. |
| [DEPLOY.md](DEPLOY.md) | Hosting it so your phone does not need a laptop. |

## Walkthroughs

A walkthrough is an ordered trace through one real sequence. Each step names the
actor (`kube-scheduler`, `03:14:40`, `containerd`), and most steps ask you to
predict what happens before revealing it, with real command output attached.

The pack ships with seven: `kubectl apply` end to end, a request finding a pod,
a rolling update and where its 502s come from, a node dying at 03:14, an RKE2
cluster booting from nothing, losing etcd quorum, and Rancher taking over a
cluster.

Predictions count toward your daily goal, so a walkthrough is a full session.

## How the scheduling works

Each exercise carries a **stability** — roughly how many days until you would
start forgetting it — and a **difficulty**. Reviews are scheduled to land just
as recall begins to slip, in the family of SM-2, Anki and FSRS.

Answer something right and its stability grows, faster if you had nearly
forgotten it and slower if the item has proven difficult; a well-known exercise
runs out to roughly 1, 2, 6, 13, 29, 63, 128, 246 days. Get it wrong and stability is cut to
days, difficulty ratchets up, and the item **comes back within the same
session** — 4, then 7, then 11 questions later, until you get it right.

That gives the progress screen a real answer to "where do I stand": **coverage**
(how much you have met), **retention** (how much of that you still hold), and
**recall** (the two combined — what you could produce today). Anything forgotten
six times or more is flagged as a leech, because drilling it again is rarely the
fix.

Answer order is randomized on every view, so you cannot learn "it's the third
one" instead of the answer.

All of it is tunable in Settings: daily goal, session length, new-per-session,
and whether units unlock in order.
