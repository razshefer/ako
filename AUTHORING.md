# Authoring content

A **pack** is a subject. A pack has **units**, a unit has **concepts**, and a
concept has a short explanation, worked examples, and **exercises**.

Nothing is compiled. Edit JSON, reload the page.

## Adding a new pack

```
content/
  packs.json                     <- add your pack id here
  terraform/
    pack.json
    units/
      01-state.json
      02-modules.json
```

`content/packs.json`

```json
{ "packs": ["k8s-architecture", "terraform"] }
```

`content/terraform/pack.json`

```json
{
  "id": "terraform",
  "title": "Terraform in anger",
  "subtitle": "State, modules and the plan/apply cycle",
  "emoji": "🏗️",
  "description": "Optional longer text shown on the pack page.",
  "units": ["01-state", "02-modules"]
}
```

`units` lists file names (without `.json`) in **learning order**. With the
guided path enabled, a unit unlocks once 70% of the previous unit's exercises
have been seen at least once.

Then check it:

```bash
python tools/validate.py
```

## Unit file

```json
{
  "id": "state",
  "title": "State and locking",
  "summary": "One line shown under the unit title.",
  "concepts": [
    {
      "id": "remote-state",
      "title": "Remote state",
      "brief": "Markdown-lite explanation...",
      "examples": [
        { "label": "Backend config", "lang": "hcl", "code": "...", "note": "..." }
      ],
      "links": [{ "label": "Docs", "url": "https://..." }],
      "items": [ ... ]
    }
  ]
}
```

The `brief` is shown once, as a "New concept" card, the first time an exercise
from that concept comes up in a session — and any time you open the concept
from the Library or the progress screen.

**Markdown-lite** in `brief`, `prompt`, `explain`, choices and steps supports:
`` `inline code` ``, `**bold**`, `*italic*`, `- bullet lists`, and blank lines
for paragraphs. Nothing else — no headings, no fenced blocks (use `examples`
for code).

`lang` on an example or a code block affects only the light syntax tinting:
`yaml`, `json`, `bash`, `sh`, `log`, `text`. Unknown values render as plain text.

## Exercise types

Every exercise needs `id`, `type`, `prompt` and `explain`. Optional on all of
them: `tag` (a small chip above the question), `hint`, and `code`:

```json
"code": { "lang": "yaml", "label": "the manifest", "text": "apiVersion: v1\n..." }
```

`explain` is shown after answering, right or wrong — write it as the teaching
moment, not as a restatement of the answer.

### `mcq` — one correct answer

```json
{
  "id": "quorum-math",
  "type": "mcq",
  "prompt": "5-member etcd, 3 members down. What happens?",
  "choices": ["Quorum is lost, writes fail", "The rest elect a leader", "..."],
  "answer": 0,
  "explain": "Quorum for 5 is 3..."
}
```

Choice order is shuffled per exercise (deterministically, from its id), so
"all of the above" style options do not work.

### `multi` — several correct answers

```json
{
  "id": "pdb-scope",
  "type": "multi",
  "prompt": "What does a PodDisruptionBudget protect against?",
  "choices": ["kubectl drain", "autoscaler scale-down", "a node losing power"],
  "answers": [0, 1],
  "explain": "PDBs constrain voluntary disruptions only..."
}
```

Marked correct only when the selected set matches exactly.

### `fill` — type the answer

```json
{
  "id": "crictl",
  "type": "fill",
  "prompt": "Which CLI talks to containerd directly using the CRI?",
  "accept": ["crictl", "crictl logs"],
  "placeholder": "command",
  "explain": "crictl speaks CRI to containerd..."
}
```

Comparison is case-insensitive and normalises whitespace, quotes, backticks,
spaces around `=`, and a trailing `.` or `;`. List every reasonable phrasing in
`accept` — the first entry is what gets shown as "the" answer.

### `order` — arrange the steps

```json
{
  "id": "etcd-write",
  "type": "order",
  "prompt": "Put a successful etcd write in order.",
  "steps": ["Leader receives the write", "Replicated to followers", "Majority acks"],
  "explain": "The commit happens only after a majority acknowledges..."
}
```

List `steps` in the **correct** order; the app shuffles them for display.

### `match` — pair them up

```json
{
  "id": "controllers",
  "type": "match",
  "prompt": "Match the controller to what it does.",
  "pairs": [
    ["node controller", "Marks nodes NotReady and evicts their pods"],
    ["garbage collector", "Deletes objects whose owner no longer exists"],
    ["namespace controller", "Empties a namespace stuck in Terminating"]
  ],
  "explain": "Knowing which loop owns a symptom..."
}
```

The right-hand column is shuffled. It auto-checks once every pair is matched,
and counts as correct only if there were no wrong attempts. Keep the text
short — these render as small tiles. Three or four pairs works best.

## Writing exercises that are worth doing

A few rules that made the Kubernetes pack useful rather than trivia:

- **Ask about consequences, not definitions.** "What breaks when the API server
  is down?" teaches more than "What is the API server?"
- **Put a real artefact in the question.** A `describe` output, a log line, a
  manifest. Recognising the shape of a real error is the actual skill.
- **Make the wrong answers plausible.** A distractor should be something you
  might genuinely believe.
- **Use `explain` to add something new**, including the "why" and the practical
  next step. It is the highest-value text in the file, because it is the only
  part read at the exact moment of being wrong.
- **One idea per exercise.** If it needs two sentences of setup and asks two
  things, split it.
- **Mix the types.** `order` for lifecycles and pipelines, `match` for
  who-does-what, `fill` for commands and field names you should have in muscle
  memory, `mcq`/`multi` for judgement calls.

## Ids and stability

Progress is keyed by `<pack>/<unit>/<concept>/<item>`. Renaming an id resets
that exercise's history; editing its text does not. Fix wording freely, change
ids only when you mean to start over.

## Checklist before committing

```bash
python tools/validate.py
```

It fails on: invalid JSON, unknown types, bad answer indexes, duplicate ids,
missing prompts/explains, concepts with no items, and missing unit files. It
warns on concepts with no examples.
