# Ako — working notes for Claude

Phone-first spaced-repetition learning app. Vanilla ES modules, JSON content,
**no build step**. Ships with a Kubernetes/RKE2/Rancher pack.

Read this first, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before
touching `app/js/`, or [AUTHORING.md](AUTHORING.md) before touching `content/`.

## Hard constraints — do not break these

1. **No Node, no npm, no build step.** There is no Node on this machine. Never
   add a bundler, a package.json, TypeScript, JSX or a dependency that needs
   installing. Browser-native ES modules only.
2. **No external network at runtime.** No CDN scripts, no web fonts, no
   analytics. The app must work fully offline after install.
3. **Relative paths only.** It is served from a subpath (`/ako/` on GitHub
   Pages). Absolute paths like `/app/js/...` break the deploy. Use
   `./…` in HTML/CSS and `new URL('../../x', import.meta.url)` in JS.
4. **Local-first.** Progress lives in `localStorage` on the device and never
   leaves it. Do not add a backend, an account, or telemetry.
5. **Content is loaded at runtime.** Adding a subject must never require a code
   change or a rebuild — only new JSON plus a line in `content/packs.json`.

## Branching — read docs/WORKFLOW.md

`feature/<name>` → `develop` → `main`. **`main` deploys to the phone on every
push**, so never commit directly to it.

Start any change with:

```bash
git checkout develop && git pull && git checkout -b feature/<name>
```

Before merging a feature into `develop`, have the **`ako-reviewer`** agent review
it and address the blocking findings. Merge with `--no-ff` so a feature stays
revertable as a unit.

`main` is protected and cannot be pushed to. **Releasing is a pull request from
`develop` into `main`, merged with a merge commit — never squashed.** Do not
open one unless asked; releasing is the user's call, not a tidy-up step.

## Verify loop

Always run all three before committing:

```bash
python tools/lint.py && python tools/validate.py
```

```bash
python serve.py
```

Then exercise it in a browser at `http://localhost:8080`. There are no unit
tests and adding a framework would break the no-build constraint, so the linter,
the validator and a manual pass **are** the bar. For UI work, check at a phone
viewport (375×812) — this is a phone app first.

`tools/lint.py` enforces the invariants that fail silently: a module missing
from the service-worker shell, an absolute path that breaks the subpath deploy,
a seeded shuffle, a theme token defined in only one theme.

## Layout

```
index.html          app shell          sw.js         offline cache
app/js/             the app            content/      the material
app/css/style.css   all styling        tools/        lint.py, validate.py, make_icons.py
docs/               these notes        deploy/       self-hosting manifests
```

Branching and review: [docs/WORKFLOW.md](docs/WORKFLOW.md).
Full module map and responsibilities: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Runtime shapes and the id scheme: [docs/DATA-MODEL.md](docs/DATA-MODEL.md).
Step-by-step for common changes: [docs/RECIPES.md](docs/RECIPES.md).

## House rules

- **Never seed a shuffle.** `shuffle(arr)` must stay random per call. Answer
  positions are deliberately unmemorizable — this was an explicit request.
- **American spelling** throughout code and content ("practice", not
  "practise"; "authorization", not "authorisation").
- **Ids are progress keys.** Renaming a content id resets that item's history.
  Reword freely; rename only when you mean to reset.
- **Reading never costs your place.** Opening a concept or a term mid-session
  uses an overlay (`conceptSheet`), never a route change. If you add a place
  where explanation is reachable from a running activity, do the same.
- **New explanatory text should be glossary-linked.** If you add a container of
  prose, add its class to `GLOSSIFY_SELECTOR` in `app/js/glossary.js`.
- Match the surrounding style: no semicolonless lines, single quotes, small
  focused functions, comments only where the *why* is not obvious.

## Content voice

The owner learns from real flows, not definitions. When writing or reviewing
content:

- Ask about **consequences**, not definitions. "What breaks when the API server
  is down?" beats "What is the API server?"
- Put a **real artifact** in the question — command output, a manifest, a log
  line.
- `explain` should teach something new, including the practical next step. It is
  read at the exact moment of being wrong, so it is the highest-value text.
- **Walkthroughs are the preferred format for a new area.** Write one before
  writing more flashcards. See [AUTHORING.md](AUTHORING.md).

## Deployment

Pushing to `main` publishes to <https://razshefer.github.io/ako/> via
`.github/workflows/pages.yml` (validates, then deploys). Details and
self-hosting: [DEPLOY.md](DEPLOY.md).

Do not push to `main` without being asked — it publishes to the phone.
