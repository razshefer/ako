# How work moves through this repo

Three branches, one direction of travel.

```
feature/<name>  ──►  develop  ──►  main  ──►  GitHub Pages ──► the phone
   the work         integration    release       deploys automatically
```

| Branch | What it is | Deploys? |
|---|---|---|
| `main` | Production. What is installed on the phone. Only ever receives merges from `develop`. | **Yes** — every push publishes |
| `develop` | Integration. Finished, reviewed features accumulate here. | No |
| `feature/<name>` | One change. Branched from `develop`, merged back into it. | No |

> `main` rather than `master`: GitHub Pages is wired to it, and renaming would
> break the deploy for no benefit.

## The loop

**1. Branch from develop**

```bash
git checkout develop && git pull && git checkout -b feature/sound-settings
```

Name it after the change, not the files. `feature/leech-surfacing`, not
`feature/progress-js`.

**2. Build it, checking as you go**

```bash
python tools/lint.py && python tools/validate.py
```

Then click through the screens you touched at a phone viewport. There is no test
framework and adding one would break the no-build constraint, so these three
things *are* the safety net.

**3. Review before merging**

Ask for the `ako-reviewer` agent. It reads the project's constraints and the
list of bugs this codebase has actually produced, runs the checks itself, and
reports blocking findings separately from nits.

Fix the blocking findings. Push back on the ones you disagree with — a review is
an argument, not a verdict.

**4. Merge into develop**

```bash
git checkout develop && git merge --no-ff feature/sound-settings
```

`--no-ff` keeps the feature visible as a unit in the history, which is what makes
it revertable later.

**5. Release when it is worth releasing**

```bash
git checkout main && git merge --no-ff develop && git push
```

That push deploys. Batch a few features rather than releasing every one — the
phone picks up changes silently, and a smaller number of larger releases is
easier to reason about when something regresses.

## What CI does

`.github/workflows/checks.yml` runs on `develop`, on `feature/**`, and on every
PR: the linter, the content validator, and a parse of every JS module. It does
not deploy.

`.github/workflows/pages.yml` runs only on `main`: validates, then publishes.

## Working through GitHub PRs instead

Everything above works with plain merges, which is the lighter path for one
person. If you want the PR surface — a diff to read, comments to leave, a record
of the review — push the branch and open a PR against `develop`:

```bash
git push -u origin feature/sound-settings
```

`.github/pull_request_template.md` prompts for the things that are easy to
forget: migration paths, orphaned content ids, new modules missing from the
offline shell.

## When to break the process

Fixing something broken in production: branch from `main` as `fix/<name>`, merge
to `main`, then merge `main` back into `develop` so the branches do not diverge.

Content-only changes — a new pack, a new walkthrough, glossary terms — can go
straight to `develop` on their own branch without much ceremony. The validator
is the real gate there, and nothing about content can break the app shell.

## Why bother, for a solo project

Two reasons, and neither is process for its own sake:

- `main` always being deployable means the phone is never broken while something
  is half-finished.
- A feature that lives on its own branch can be reverted as a unit. The
  scheduler rewrite touched nine files; undoing that from a linear history would
  be archaeology.
