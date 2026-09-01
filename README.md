# Reps

Duolingo-style drilling for technical subjects, built to be used on a phone in
five-minute sessions. Ships with a 157-exercise **Kubernetes Architecture**
pack written around RKE2 and Rancher.

- Short daily sessions, streaks, a daily goal and XP
- Spaced repetition — every exercise has its own review schedule
- Practical first: every concept leads with real YAML, commands and log output
- Progress tracking per unit and per concept, with a "needs another look" list
- Any subject can be added by dropping a folder in `content/`
- Installable as a PWA and works offline
- **No build step, no npm, no account, no server** — plain ES modules and JSON

## Running it

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
    components/         exercise widgets, icons, small render helpers
    views/              home, session, progress, library, settings
content/
  packs.json            list of installed packs
  k8s-architecture/
    pack.json           title, emoji, unit order
    units/*.json        concepts + exercises
tools/
  validate.py           check content before committing
  make_icons.py         regenerate the PWA icons
```

## Adding a subject

See [AUTHORING.md](AUTHORING.md). Short version: copy a unit file, edit the
JSON, register the pack in `content/packs.json`, run `python tools/validate.py`.
No rebuild — reload the page.

## How the scheduling works

Each exercise has a Leitner box (0–7) and an ease factor. Answer it right and
it moves up a box, coming back after 1, 2, 4, 9, 18, 35 or 70 days. Answer it
wrong and it drops back, returns later in the same session, and is due again
tomorrow.

A session is built from due reviews first, then a capped number of new
exercises, interleaved. Concept mastery is the average strength of its
exercises, which is what drives the progress bars and the weak-spots list.

All of it is tunable in Settings: daily goal, session length, new-per-session,
and whether units unlock in order.
