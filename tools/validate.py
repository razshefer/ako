"""Validate every content pack before you commit it.

    python tools/validate.py

Checks JSON syntax, required fields per exercise type, duplicate ids and
answer-index sanity, then prints a summary of the pack.
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"

# pack titles carry emoji; Windows consoles default to cp1252
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

TYPES = {"mcq", "multi", "fill", "order", "match"}
errors: list[str] = []
warnings: list[str] = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f"{path.relative_to(ROOT)}: invalid JSON at line {e.lineno}: {e.msg}")
        return None


def check_item(item, where, seen_ids):
    iid = item.get("id")
    if not iid:
        err(f"{where}: item without an id")
        return
    key = f"{where}/{iid}"
    if iid in seen_ids:
        err(f"{where}: duplicate item id '{iid}'")
    seen_ids.add(iid)

    t = item.get("type")
    if t not in TYPES:
        err(f"{key}: unknown type '{t}' (expected one of {sorted(TYPES)})")
        return
    if not item.get("prompt"):
        err(f"{key}: missing prompt")
    if not item.get("explain"):
        err(f"{key}: missing explain")

    if t == "mcq":
        choices = item.get("choices") or []
        if len(choices) < 2:
            err(f"{key}: mcq needs at least 2 choices")
        a = item.get("answer")
        if not isinstance(a, int) or not (0 <= a < len(choices)):
            err(f"{key}: answer must be a valid index into choices")
    elif t == "multi":
        choices = item.get("choices") or []
        answers = item.get("answers") or []
        if len(choices) < 3:
            err(f"{key}: multi needs at least 3 choices")
        if not answers:
            err(f"{key}: multi needs a non-empty answers list")
        for a in answers:
            if not isinstance(a, int) or not (0 <= a < len(choices)):
                err(f"{key}: answers index {a} out of range")
        if len(set(answers)) != len(answers):
            err(f"{key}: duplicate entries in answers")
        if len(answers) == len(choices):
            warn(f"{key}: every choice is correct - is that intended?")
    elif t == "fill":
        if not item.get("accept"):
            err(f"{key}: fill needs a non-empty accept list")
        if not item.get("placeholder"):
            warn(f"{key}: fill has no placeholder hint")
    elif t == "order":
        steps = item.get("steps") or []
        if len(steps) < 3:
            err(f"{key}: order needs at least 3 steps")
    elif t == "match":
        pairs = item.get("pairs") or []
        if len(pairs) < 3:
            err(f"{key}: match needs at least 3 pairs")
        for p in pairs:
            if not (isinstance(p, list) and len(p) == 2):
                err(f"{key}: each pair must be a two-element array")

    code = item.get("code")
    if code is not None and not code.get("text"):
        err(f"{key}: code block has no text")


def main():
    index_path = CONTENT / "packs.json"
    index = load(index_path)
    if index is None:
        return report()

    totals = Counter()
    for pack_id in index.get("packs", []):
        pack_dir = CONTENT / pack_id
        meta = load(pack_dir / "pack.json")
        if meta is None:
            continue
        print(f"\n{meta.get('emoji', '')} {meta.get('title', pack_id)}  ({pack_id})")

        seen_items: set[str] = set()
        seen_concepts: set[str] = set()
        pack_items = 0

        for unit_file in meta.get("units", []):
            path = pack_dir / "units" / f"{unit_file}.json"
            if not path.exists():
                err(f"{pack_id}: unit file missing: {path.relative_to(ROOT)}")
                continue
            unit = load(path)
            if unit is None:
                continue

            unit_items = 0
            for concept in unit.get("concepts", []):
                cid = concept.get("id")
                where = f"{pack_id}/{unit.get('id', unit_file)}/{cid}"
                if not cid:
                    err(f"{where}: concept without an id")
                if cid in seen_concepts:
                    err(f"{pack_id}: duplicate concept id '{cid}'")
                seen_concepts.add(cid)
                if not concept.get("brief"):
                    err(f"{where}: concept has no brief")
                if not concept.get("examples"):
                    warn(f"{where}: concept has no examples")
                items = concept.get("items", [])
                if not items:
                    err(f"{where}: concept has no items")
                for item in items:
                    check_item(item, where, seen_items)
                    totals[item.get("type")] += 1
                unit_items += len(items)

            pack_items += unit_items
            print(f"   {unit.get('title', unit_file):<38} "
                  f"{len(unit.get('concepts', [])):>2} concepts  {unit_items:>3} exercises")

        print(f"   {'':<38} {'':>2}           {pack_items:>3} total")

    print("\nExercise types:", ", ".join(f"{k}={v}" for k, v in sorted(totals.items())))
    return report()


def report():
    for w in warnings:
        print(f"  warn  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\nOK - no errors, {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
