#!/usr/bin/env python3
"""Stamp sw.js with a VERSION derived from the shell it caches.

Why this exists
---------------
The service worker caches the app shell cache-first, and a browser only
installs a new worker when `sw.js` itself changes *byte for byte*. So shipping
new JS without touching `sw.js` deploys nothing: the phone keeps serving the
copy it cached the first time, forever. That is exactly what happened — the XP
removal reached GitHub Pages and never reached the phone.

Bumping VERSION by hand is the obvious fix and the wrong one, because
forgetting it is silent and only shows up as "why is my phone still old".
Instead the version *is* a hash of the shell, so it changes if and only if the
cached files change, and `--check` makes a stale stamp a lint failure.

    python tools/stamp.py            # rewrite VERSION to match the shell
    python tools/stamp.py --check    # exit 1 if it is stale
"""

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW = ROOT / 'sw.js'

VERSION_RE = re.compile(r"^const VERSION = '([^']*)';[ \t]*\r?$", re.M)
SHELL_RE = re.compile(r'const SHELL = \[(.*?)\];', re.S)
BINARY_SUFFIXES = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2'}


def shell_paths(src):
    """The './...' entries of the SHELL array, in source order."""
    block = SHELL_RE.search(src)
    if not block:
        raise SystemExit('stamp: could not find the SHELL array in sw.js')
    return re.findall(r"'(\./[^']*)'", block.group(1))


def content_bytes(path):
    """File bytes with line endings normalized, so the stamp is portable.

    This working tree holds a mix of CRLF and LF — files checked out before
    .gitattributes set `eol=lf` kept their CRLF — while CI checks everything out
    as LF. Hashing raw bytes would therefore produce a different version on
    Windows than on Linux, and the check would fail on whichever ran second.
    Binary files are hashed as-is; normalizing them would corrupt the hash.
    """
    data = path.read_bytes()
    if path.suffix.lower() in BINARY_SUFFIXES or b'\x00' in data:
        return data
    return data.replace(b'\r\n', b'\n')


def compute(src):
    """A hash of every shell file, plus sw.js's own logic.

    The VERSION line is blanked before hashing sw.js so the stamp does not
    depend on itself; every other edit to the worker still moves it.
    """
    h = hashlib.sha256()
    h.update(VERSION_RE.sub("const VERSION = '';", src).replace('\r\n', '\n').encode())

    for rel in sorted(shell_paths(src)):
        # './' is the directory itself — index.html already covers it
        if rel == './':
            continue
        path = ROOT / rel[2:]
        if not path.exists():
            raise SystemExit(f'stamp: SHELL lists {rel}, which does not exist')
        h.update(rel.encode())
        h.update(content_bytes(path))

    return 'ako-' + h.hexdigest()[:10]


def current(src):
    m = VERSION_RE.search(src)
    if not m:
        raise SystemExit('stamp: could not find the VERSION line in sw.js')
    return m.group(1)


def main():
    check = '--check' in sys.argv
    src = SW.read_text(encoding='utf-8')
    want, have = compute(src), current(src)

    if want == have:
        print(f'sw.js VERSION is current: {have}')
        return 0

    if check:
        print(f'sw.js VERSION is stale: {have} -> should be {want}')
        print('The shell changed but the worker did not, so installed copies')
        print('would never update. Run: python tools/stamp.py')
        return 1

    SW.write_text(VERSION_RE.sub(f"const VERSION = '{want}';", src, count=1), encoding='utf-8')
    print(f'sw.js VERSION {have} -> {want}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
