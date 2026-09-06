## Shipping

<!-- What features are in this release. One line each, user-facing language. -->

## Checks

- [ ] `checks` is green on `develop`
- [ ] Clicked through the app at a phone viewport since the last release
- [ ] Merging with **Create a merge commit** — not squash (see below)

## Phone notes

- [ ] Service-worker shell changed (new modules/assets) → the app needs a full
      close-and-reopen on the phone to pick it up
- [ ] Saved-state shape changed → migration path is:
- [ ] Content ids renamed → progress orphaned:

---

> **Merge with a merge commit.** Squashing a release PR collapses every feature
> into one commit on `main`, so `main` and `develop` no longer share history and
> the next release conflicts with itself.
