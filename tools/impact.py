"""What a branch actually changes, in the categories that bite.

    python tools/impact.py [base]      # base defaults to develop

Diffs the working branch against `base` and reports only the things that are
easy to miss in a diff and expensive to miss in production:

  - modules added or removed        -> the offline shell must match
  - saved-state shape changes       -> an existing phone must still load
  - content ids that disappeared    -> progress silently orphaned
  - scheduler touched               -> print the interval ladder before merging

It is a prompt, not a gate. Nothing here fails a build; lint.py does that.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


def git(*args, ok_fail=False):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if r.returncode and not ok_fail:
        sys.exit(f"git {' '.join(args)} failed:\n{r.stderr.strip()}")
    return r.stdout


def show(ref, path):
    """File contents at a ref, or None if it does not exist there.

    `ref` of None means the working tree, so this reports on work in progress
    rather than only on what has been committed — which is when you want it.
    """
    if ref is None:
        f = ROOT / path
        return f.read_text(encoding="utf-8", errors="replace") if f.exists() else None
    r = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return None if r.returncode else r.stdout


def content_ids(ref):
    """Every item id in the content tree at `ref`, as pack/unit/concept/item."""
    ids, flows = set(), set()
    index = show(ref, "content/packs.json")
    if not index:
        return ids, flows
    try:
        packs = json.loads(index).get("packs", [])
    except json.JSONDecodeError:
        return ids, flows

    for pack_id in packs:
        meta_raw = show(ref, f"content/{pack_id}/pack.json")
        if not meta_raw:
            continue
        try:
            meta = json.loads(meta_raw)
        except json.JSONDecodeError:
            continue
        pid = meta.get("id", pack_id)

        for unit_file in meta.get("units", []):
            raw = show(ref, f"content/{pack_id}/units/{unit_file}.json")
            if not raw:
                continue
            try:
                unit = json.loads(raw)
            except json.JSONDecodeError:
                continue
            uid = unit.get("id", unit_file)
            for c in unit.get("concepts", []):
                cid = c.get("id")
                for it in c.get("items", []):
                    ids.add(f"{pid}/{uid}/{cid}/{it.get('id')}")

        for flow_file in meta.get("flows", []):
            raw = show(ref, f"content/{pack_id}/flows/{flow_file}.json")
            if raw:
                try:
                    flows.add(f"{pid}/{json.loads(raw).get('id', flow_file)}")
                except json.JSONDecodeError:
                    pass
    return ids, flows


def object_keys(src, *markers):
    """
    Keys of the object literal following the last marker in sequence.

    Two shapes matter here and they nest differently — `DEFAULT_SETTINGS = {…}`
    is the object itself, while `blank()` returns one from inside a function —
    so the caller says how to get there rather than the parser guessing.
    """
    if not src:
        return set()
    idx = 0
    for m in markers:
        j = src.find(m, idx)
        if j < 0:
            return set()
        idx = j + len(m)
    i = src.find("{", idx)
    if i < 0:
        return set()

    depth, out, cur = 0, set(), ""
    for ch in src[i:]:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                break
        elif ch == ":" and depth == 1:
            name = cur.strip().split()[-1] if cur.strip() else ""
            if name.isidentifier():
                out.add(name)
            cur = ""
        elif ch in ",\n":
            cur = ""
        else:
            cur += ch
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "develop"
    head = git("rev-parse", "--abbrev-ref", "HEAD").strip()
    if not git("rev-parse", "--verify", base, ok_fail=True).strip():
        sys.exit(f"no such ref: {base}")

    # Compare against the merge base, not the tip of `base`. Diffing the tip
    # reports everything `base` gained since you branched as though *you* had
    # deleted it, turning someone else's new module into "module removed, take
    # it out of the shell".
    fork = git("merge-base", base, "HEAD").strip() or base

    # --no-renames so a move shows as delete+add; git would otherwise emit
    # `R100 old new`, which matches neither test below and reports nothing.
    # -uall so a new module inside a new directory is listed as the file rather
    # than collapsed to the containing folder.
    # The working tree, not just what is committed — this runs mid-feature.
    changed = [l.split("\t") for l in
               git("diff", "--name-status", "--no-renames", fork).splitlines() if l]
    changed += [["A", l[3:]] for l in
                git("status", "--porcelain", "-uall").splitlines() if l.startswith("?? ")]
    if not changed:
        print(f"No changes against {base}.")
        return 0

    print(f"{head} vs {base} — {len(changed)} file(s) changed\n")
    notes = []

    # --- modules added or removed
    js_add = [f[-1] for f in changed if f[-1].startswith("app/js/") and f[0].startswith("A")]
    js_del = [f[-1] for f in changed if f[-1].startswith("app/js/") and f[0].startswith("D")]
    if js_add or js_del:
        for f in js_add:
            notes.append(("module added", f, "must be listed in SHELL in sw.js, or it 404s offline"))
        for f in js_del:
            notes.append(("module removed", f, "remove it from SHELL in sw.js"))

    # --- other assets that need caching
    for f in changed:
        p = f[-1]
        if f[0].startswith("A") and p.startswith("app/") and not p.endswith((".js", ".md")):
            notes.append(("asset added", p, "add it to SHELL in sw.js or it 404s offline"))

    # --- saved-state shape
    old_store, new_store = show(fork, "app/js/store.js"), show(None, "app/js/store.js")
    if old_store != new_store:
        shapes = ((("DEFAULT_SETTINGS =",), "setting"),
                  (("function blank()", "return"), "state field"))
        for markers, label in shapes:
            before = object_keys(old_store, *markers)
            after = object_keys(new_store, *markers)
            for k in sorted(after - before):
                notes.append((f"{label} added", k, "safe — load() merges over blank() defaults"))
            for k in sorted(before - after):
                notes.append((f"{label} REMOVED", k,
                              "an existing save still carries it; make sure nothing reads it"))

    # --- content ids
    old_items, old_flows = content_ids(fork)
    new_items, new_flows = content_ids(None)
    gone = old_items - new_items
    if gone:
        notes.append(("content ids removed", f"{len(gone)} exercise(s)",
                      "progress for these is orphaned — intended only if the content really went"))
        for i in sorted(gone)[:5]:
            notes.append(("", f"  {i}", ""))
    added = new_items - old_items
    if added:
        notes.append(("content ids added", f"{len(added)} exercise(s)", "they start as new material"))
    for f in sorted(new_flows - old_flows):
        notes.append(("walkthrough added", f, ""))
    for f in sorted(old_flows - new_flows):
        notes.append(("walkthrough REMOVED", f,
                      "completion recorded in state.flows for it is orphaned"))

    # --- scheduler and the record shape it owns
    if any(f[-1] == "app/js/srs.js" for f in changed):
        notes.append(("scheduler touched", "app/js/srs.js",
                      "print both interval ladders before merging — see docs/RECIPES.md"))
        old_srs, new_srs = show(fork, "app/js/srs.js"), show(None, "app/js/srs.js")
        before = object_keys(old_srs, "function newRecord()", "return")
        after = object_keys(new_srs, "function newRecord()", "return")
        for k in sorted(after - before):
            notes.append(("record field added", k, "safe — absent on old records, reads as undefined"))
        for k in sorted(before - after):
            notes.append(("record field REMOVED", k,
                          "every existing save still carries it; needs a migrateRecord() path"))

    if any(f[-1] == "sw.js" for f in changed):
        notes.append(("service worker changed", "sw.js",
                      "the phone needs a full close-and-reopen to pick this up"))

    if not notes:
        print("  Nothing in the risky categories. Still run lint.py and validate.py.")
        return 0

    width = max(len(n[0]) for n in notes if n[0]) if any(n[0] for n in notes) else 0
    for label, thing, why in notes:
        if not label:
            print(f"  {thing}")
            continue
        print(f"  {label:<{width}}  {thing}")
        if why:
            print(f"  {'':<{width}}  → {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
