# How work moves through this repo

Three branches, one direction of travel.

```
feature/<name>  ──►  develop  ──►  main  ──►  GitHub Pages ──► the phone
   the work         integration    release       deploys automatically
```

| Branch | What it is | Deploys? |
|---|---|---|
| `main` | Production. What is installed on the phone. Protected — only ever receives merges from `develop`, through a PR. | **Yes** — every merge publishes |
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

**5. Release through a pull request**

`main` is protected by a ruleset, so it is not pushed to directly. A release is
a PR from `develop` into `main`:

```bash
git push origin develop
```

Then open the PR — this URL preselects the release template:

```
https://github.com/razshefer/ako/compare/main...develop?template=release.md
```

The `checks` workflow gates it. Merge with **Create a merge commit**.

> **Never squash a release PR.** Squashing collapses every feature into a single
> commit on `main`, so `main` and `develop` stop sharing history and the *next*
> release conflicts with itself. Worth turning squash merging off entirely in
> Settings → General → Pull Requests so the wrong button is not there to click.

Merging deploys. Batch a few features rather than releasing every one — the
phone picks up changes silently, and fewer, larger releases are easier to reason
about when something regresses.

After the merge, `main` and `develop` share history, so there is nothing to
back-merge. That is only needed after a hotfix.

## What CI does

`.github/workflows/checks.yml` runs on `develop`, on `feature/**`, and on every
PR: the linter, the content validator, and a parse of every JS module. It does
not deploy.

`.github/workflows/pages.yml` runs only on `main`: validates, then publishes.

## Feature PRs are optional; release PRs are not

Merging a feature into `develop` locally is fine — `develop` is not protected,
and for one person a local `--no-ff` merge after an agent review is enough.

Open a feature PR when you want the surface: a diff to read later, somewhere to
leave notes, a record of why something was done.

```bash
git push -u origin feature/sound-settings
```

`.github/pull_request_template.md` prompts for the things that are easy to
forget: migration paths, orphaned content ids, new modules missing from the
offline shell.

Releases are always a PR, because `main` is protected and because that is the
moment a gate is worth having.

## When to break the process

Fixing something broken in production: branch from `main` as `fix/<name>`, open
a PR into `main`, and once it is merged, bring `main` back into `develop` so the
branches do not diverge:

```bash
git checkout develop && git merge --no-ff origin/main && git push origin develop
```

Skipping that back-merge is how the two branches quietly drift apart and the
next release turns into a conflict archaeology session.

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
