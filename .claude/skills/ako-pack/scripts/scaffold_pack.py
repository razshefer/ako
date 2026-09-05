"""Scaffold a new Ako content pack and register it.

    python .claude/skills/ako-pack/scripts/scaffold_pack.py <pack-id> "<Title>" \
        --emoji "🏗️" --subtitle "State, modules and the plan/apply cycle"

Creates content/<pack-id>/{pack.json,units/,flows/} and adds the pack to
content/packs.json. Registration is the step that is easy to forget and silently
makes the whole pack invisible, which is why this exists.

Idempotent: re-running on an existing pack leaves pack.json alone and only fixes
the registration.
"""
import argparse
import json
import sys
from pathlib import Path

# repo root is four levels up from .claude/skills/ako-pack/scripts/
ROOT = Path(__file__).resolve().parents[4]
CONTENT = ROOT / "content"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


def load(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description="Scaffold and register an Ako content pack.")
    ap.add_argument("pack_id", help="directory and id, e.g. terraform")
    ap.add_argument("title", help='display title, e.g. "Terraform in anger"')
    ap.add_argument("--emoji", default="📘", help="shown next to the title")
    ap.add_argument("--subtitle", default="", help="one line under the title")
    ap.add_argument("--description", default="", help="longer text on the pack page")
    args = ap.parse_args()

    if not CONTENT.is_dir():
        sys.exit(f"content/ not found at {CONTENT} — run this from inside the ako repo")

    pack_dir = CONTENT / args.pack_id
    (pack_dir / "units").mkdir(parents=True, exist_ok=True)
    (pack_dir / "flows").mkdir(parents=True, exist_ok=True)

    pack_json = pack_dir / "pack.json"
    if pack_json.exists():
        print(f"kept   {pack_json.relative_to(ROOT)} (already exists)")
    else:
        dump(pack_json, {
            "id": args.pack_id,
            "title": args.title,
            "subtitle": args.subtitle,
            "emoji": args.emoji,
            "description": args.description,
            "units": [],
            "flows": [],
        })
        print(f"wrote  {pack_json.relative_to(ROOT)}")

    index_path = CONTENT / "packs.json"
    index = load(index_path, {"packs": []})
    if args.pack_id in index.get("packs", []):
        print(f"kept   {index_path.relative_to(ROOT)} (already registered)")
    else:
        index.setdefault("packs", []).append(args.pack_id)
        dump(index_path, index)
        print(f"wrote  {index_path.relative_to(ROOT)} (registered '{args.pack_id}')")

    print(f"""
Next:
  1. write content/{args.pack_id}/flows/01-<slug>.json   (a walkthrough, first)
  2. write content/{args.pack_id}/units/01-<slug>.json
  3. list both in content/{args.pack_id}/pack.json under "flows" and "units"
  4. python tools/validate.py

A pack with empty units[] and flows[] validates but shows nothing.""")


if __name__ == "__main__":
    main()
