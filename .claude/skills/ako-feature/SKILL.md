---
name: ako-feature
description: The working process for any change to the Ako app — branching, verifying, review and merge. Use this whenever starting, continuing or finishing work on Ako: "let's add X", "fix the Y bug", "change how Z works", "is this ready to merge", or any request that will edit files in this repo. It exists so a change never ends up committed on the wrong branch, merged without review, or shipped to the phone by accident.
---

# Working on a feature in Ako

Every change goes `feature/<name>` → `develop` → `main`, and **`main` deploys to
a real phone the moment it is merged**. That is the whole reason this process
exists; it is not paperwork.

Reference: [docs/WORKFLOW.md](../../../docs/WORKFLOW.md) for the rationale,
[CLAUDE.md](../../../CLAUDE.md) for the constraints you must not break.

## Before touching anything

Check where you are. Landing commits on `develop` — or worse, `main` — is the
mistake this skill exists to prevent.

```bash
git status -sb && git branch --show-current
```

If you are not already on a `feature/*` branch for *this* change:

```bash
git checkout develop && git pull && git checkout -b feature/<name>
```

Name the branch after the change, not the files: `feature/leech-surfacing`,
not `feature/progress-js`.

**If there is uncommitted work on `develop`,** stop and ask. It may be someone's
work in progress, and moving it to a branch is a decision, not a cleanup.

## While building

Small commits, each one a thing that works. Nothing else to it.

The one habit worth keeping: when you change something whose behaviour you
cannot see by reading it — the scheduler, the sound envelopes, a queue-building
rule — **run it and print the result** before moving on. This codebase has
produced several bugs that looked correct in the diff and were wrong in fact.

## Before asking for review

Three things, in this order:

```bash
python tools/lint.py && python tools/validate.py
```

```bash
python tools/impact.py
```

`lint.py` and `validate.py` are gates — they must pass. `impact.py` is a prompt:
it tells you what your change touched in the categories that fail silently, and
what each one obliges you to do.

```
module added         app/js/newthing.js
                     → must be listed in SHELL in sw.js, or it 404s offline
state field REMOVED  seenIntro
                     → an existing save still carries it; make sure nothing reads it
content ids removed  2 exercise(s)
                     → progress for these is orphaned
scheduler touched    app/js/srs.js
                     → print both interval ladders before merging
```

Act on every line it prints. Then click through the screens you changed at a
phone viewport (375×812) — `python serve.py` and open `localhost:8080`. There is
no test framework and adding one would break the no-build constraint, so this
pass is not optional garnish, it is the test suite.

## Review

Ask for the **`ako-reviewer`** agent on the branch. It reads the constraints and
the list of bugs this codebase has actually produced, runs the checks itself,
and separates blocking findings from nits.

Take the blocking findings seriously — on its first outing it caught a
documented test that was measuring the wrong thing. Push back where you
disagree; a review is an argument, not a verdict. Fix, re-run the checks,
and say what you changed.

Skip the review only for changes that cannot break the app: docs, or content
that the validator fully covers. Say that you are skipping it and why, rather
than quietly not doing it.

## Merging into develop

```bash
git checkout develop && git merge --no-ff feature/<name> && git push origin develop
git branch -d feature/<name>
```

`--no-ff` keeps the feature revertable as a unit. `develop` is not protected, so
this needs no PR — open one only when you want the diff on the record.

## Releasing — only when asked

**Do not do this as a tidy-up step.** Shipping is the user's call, because it
publishes to their phone.

When they ask:

```bash
gh pr create --base main --head develop --title "Release: <summary>" --body "..."
```

Use `.github/PULL_REQUEST_TEMPLATE/release.md` as the shape of the body. Then
report the PR link and the check status, and **wait for an explicit go-ahead**
before:

```bash
gh pr merge <n> --merge
```

`--merge`, never `--squash`: squashing collapses every feature into one commit
on `main`, so `main` and `develop` stop sharing history and the next release
conflicts with itself.

Permission to merge one release does not carry to the next. Ask each time.

## The things that go wrong

- **Committing on `develop` by habit.** Check the branch first, every time.
- **Merging without review** because the change felt small. The scheduler
  rewrite felt small.
- **Skipping the phone-viewport pass** because it looked right on a desktop
  browser. Several of this app's bugs were layout-only and invisible at
  desktop width.
- **Releasing unprompted.** A green `develop` is not a request to ship.
