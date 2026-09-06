"""Check the project's own invariants — the ones a generic linter cannot know.

    python tools/lint.py

Every rule here exists because breaking it caused a real bug, and most of them
fail silently: a module missing from the service worker shell works perfectly
online and 404s on a train. They are documented in CLAUDE.md and
docs/ARCHITECTURE.md; this makes them enforceable.

Exit code 1 on any error. Warnings never fail the build.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

errors: list[str] = []
warnings: list[str] = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def read(rel):
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""


def js_files():
    return sorted(p for p in (ROOT / "app" / "js").rglob("*.js"))


def block_after(css, selector):
    """Body of the first `selector{...}` block, by brace matching."""
    i = css.find(selector)
    if i < 0:
        return ""
    i = css.find("{", i)
    if i < 0:
        return ""
    depth, j = 0, i
    while j < len(css):
        if css[j] == "{":
            depth += 1
        elif css[j] == "}":
            depth -= 1
            if depth == 0:
                return css[i + 1:j]
        j += 1
    return css[i + 1:]


# ---------------------------------------------------------------- rules

def check_service_worker_shell():
    """A module missing from SHELL works online and 404s offline."""
    sw = read("sw.js")
    shell = set(re.findall(r"'\./(app/js/[^']+\.js)'", sw))
    actual = {p.relative_to(ROOT).as_posix() for p in js_files()}

    for missing in sorted(actual - shell):
        err(f"sw.js: '{missing}' is not in the offline SHELL list — it will 404 offline")
    for ghost in sorted(shell - actual):
        err(f"sw.js: SHELL lists '{ghost}', which does not exist")

    for asset in ("app/css/style.css", "index.html", "app/manifest.webmanifest"):
        if asset not in sw:
            err(f"sw.js: SHELL is missing '{asset}'")

    # Non-JS assets were the blind spot: the rule above only enumerated
    # app/js/**, so an icon referenced by the manifest could sit outside SHELL
    # and 404 offline while the linter stayed green. It did — icon-maskable-512.
    for ref in referenced_assets():
        if f"'./{ref}'" not in sw:
            err(f"sw.js: SHELL is missing '{ref}', which is referenced but would 404 offline")


def referenced_assets():
    """Local files index.html and the manifest point at, repo-relative."""
    out = set()

    for m in re.finditer(r'(?:href|src)="\./([^"]+)"', read("index.html")):
        out.add(m.group(1))

    # manifest paths are relative to app/, where the manifest lives
    for m in re.finditer(r'"src"\s*:\s*"\./([^"]+)"', read("app/manifest.webmanifest")):
        out.add(f"app/{m.group(1)}")

    # only things that are actually files in the repo
    return sorted(r for r in out if (ROOT / r).is_file())


def check_absolute_paths():
    """The app is served from a subpath (/ako/), so absolute paths break it."""
    pat = re.compile(r"""(?:href|src)\s*=\s*["']/(?!/)|url\(\s*['"]?/(?!/)|from\s+['"]/(?!/)""")
    for rel in ["index.html", "app/css/style.css", "app/manifest.webmanifest"]:
        for n, line in enumerate(read(rel).splitlines(), 1):
            if pat.search(line):
                err(f"{rel}:{n}: absolute path — breaks the subpath deploy")
    # In JS the dangerous forms are runtime lookups, not just import specifiers:
    # fetch('/content/…') and new URL('/sw.js', …) both work locally and 404
    # under /ako/ on Pages.
    js_pat = re.compile(
        r"""(?:from|import)\s*\(?\s*['"]/(?!/)"""
        r"""|fetch\(\s*['"`]/(?!/)"""
        r"""|new\s+URL\(\s*['"`]/(?!/)"""
        r"""|(?:href|src|action)\s*=\s*['"`]/(?!/)"""
    )
    for p in js_files():
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if js_pat.search(line):
                err(f"{p.relative_to(ROOT)}:{n}: absolute path — breaks the subpath deploy")


def check_shuffle_unseeded():
    """A seeded shuffle makes answer positions memorizable. Explicitly not wanted."""
    for p in js_files():
        src = p.read_text(encoding="utf-8")
        if p.name == "util.js":
            continue
        for n, line in enumerate(src.splitlines(), 1):
            m = re.search(r"\bshuffle\(", line)
            if not m:
                continue
            # walk the argument list, ignoring commas nested in brackets
            depth, i, top_commas = 0, m.end() - 1, 0
            while i < len(line):
                ch = line[i]
                if ch in "([{":
                    depth += 1
                elif ch in ")]}":
                    depth -= 1
                    if depth == 0:
                        break
                elif ch == "," and depth == 1:
                    top_commas += 1
                i += 1
            if top_commas:
                err(f"{p.relative_to(ROOT)}:{n}: shuffle() with a seed — "
                    f"answer order must be random on every view")


def check_spelling():
    """American spelling throughout, matching the Kubernetes docs the content cites."""
    bad = {
        "practise": "practice", "practising": "practicing",
        "authorisation": "authorization", "authorised": "authorized",
        "behaviour": "behavior", "customise": "customize", "customisation": "customization",
        "initialise": "initialize", "organisation": "organization",
        "recognise": "recognize", "utilisation": "utilization",
        "normalise": "normalize", "prioritise": "prioritize", "labelled": "labeled",
    }
    targets = [p for p in js_files()]
    targets += [ROOT / "app" / "css" / "style.css", ROOT / "index.html"]
    targets += sorted((ROOT / "content").rglob("*.json"))
    for p in targets:
        if not p.exists():
            continue
        src = p.read_text(encoding="utf-8")
        low = src.lower()
        for wrong, right in bad.items():
            if wrong in low:
                n = next((i for i, line in enumerate(src.splitlines(), 1)
                          if wrong in line.lower()), 0)
                err(f"{p.relative_to(ROOT)}:{n}: '{wrong}' — use '{right}'")


def check_css_tokens():
    """A token defined only inside a theme block breaks the other theme."""
    css = read("app/css/style.css")
    root = set(re.findall(r"(--[\w-]+)\s*:", block_after(css, ":root{")))
    if not root:
        root = set(re.findall(r"(--[\w-]+)\s*:", block_after(css, ":root {")))
    light = set(re.findall(r"(--[\w-]+)\s*:", block_after(css, '[data-theme="light"]')))
    used = set(re.findall(r"var\(\s*(--[\w-]+)", css))

    for token in sorted(used - root - light):
        err(f"style.css: var({token}) is used but never defined")
    for token in sorted(light - root):
        err(f"style.css: {token} is defined only in the light theme — dark mode has no value for it")


def check_console_noise():
    """console.log left in shipped code. warn/error are intentional."""
    for p in js_files():
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\bconsole\.log\b", line):
                warn(f"{p.relative_to(ROOT)}:{n}: console.log left in")


def check_settings_documented():
    """Every setting should be reachable from the Settings screen."""
    store = read("app/js/store.js")
    settings_js = read("app/js/views/settings.js")
    block = block_after(store, "DEFAULT_SETTINGS = ")
    keys = re.findall(r"^\s*(\w+)\s*:", block, re.M)
    for k in keys:
        if f"'{k}'" not in settings_js:
            warn(f"store.js: setting '{k}' has no row in the Settings screen")


def check_sw_version_stamped():
    """A stale VERSION means the phone never sees the deploy.

    The browser installs a new worker only when sw.js changes byte for byte, so
    shipping new app code without moving VERSION publishes to GitHub Pages and
    reaches nobody who already has the app. That is not hypothetical: the XP
    removal sat live for two releases while the phone kept its cached copy.
    """
    sys.path.insert(0, str(ROOT / "tools"))
    import stamp

    src = stamp.SW.read_text(encoding="utf-8")
    try:
        want, have = stamp.compute(src), stamp.current(src)
    except SystemExit as e:
        # a missing SHELL entry is reported by the check above; collect it here
        # rather than letting it end the run before the later rules execute
        err(f"sw.js: cannot compute VERSION - {e}")
        return
    if want != have:
        err(
            f"sw.js: VERSION is '{have}' but the shell hashes to '{want}' - "
            f"installed copies would never update. Run: python tools/stamp.py"
        )


# ---------------------------------------------------------------- run

CHECKS = [
    ("service worker shell", check_service_worker_shell),
    ("sw version stamped", check_sw_version_stamped),
    ("relative paths", check_absolute_paths),
    ("unseeded shuffles", check_shuffle_unseeded),
    ("american spelling", check_spelling),
    ("css tokens", check_css_tokens),
    ("console noise", check_console_noise),
    ("settings coverage", check_settings_documented),
]


def main():
    for label, fn in CHECKS:
        before = len(errors)
        fn()
        mark = "FAIL" if len(errors) > before else "ok"
        print(f"  {mark:<4} {label}")

    print()
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
