---
name: ako-pack
description: Author content for the Ako learning app — a new subject pack, or new units and walkthroughs for an existing one. Use this whenever someone wants to add, extend or draft learning material for Ako: "add a Terraform pack", "I want to learn Postgres internals in ako", "write a unit on cert-manager", "make me some exercises about X", or any request to teach a technical subject through this app. Also use it when reviewing whether existing Ako content is any good, since the standards it encodes are what "good" means here.
---

# Authoring an Ako pack

Ako teaches technical subjects through short daily sessions. Content lives as
JSON under `content/` and is loaded at runtime — no build step, no code changes.

The JSON schemas are in `AUTHORING.md` at the repo root. **Read it before
writing any file.** This skill covers the part that document does not: how to
scope a subject and how to write material that is actually worth answering.

## Why this is hard, and what usually goes wrong

Anyone can generate a hundred questions about Kubernetes. Almost all of them
will be worthless, because the default failure is writing a quiz about
vocabulary instead of building a mental model.

The owner of this app was explicit about it: *"just asking 'what is …' is much
less effective to me than needing to go over a full flow of an action that
involves the concepts themselves, while explaining them and seeing how they
interact and behave."*

Every rule below comes out of that.

## Workflow

The order matters. Scoping badly is expensive to undo once you have written 150
exercises against the wrong outline.

### 1. Scope the subject

Ask what they actually want to be able to do, not what the subject is. "Learn
Postgres" and "stop being scared of a slow query at 2am" produce completely
different packs.

Then propose **6–10 units**. A unit is a coherent area someone could hold in
their head, not a chapter of the official docs. Good units usually correspond to
a *system boundary* or a *failure surface*:

- ✅ "What runs on a node", "The path of an API request", "Failure modes and triage"
- ❌ "Introduction", "Advanced topics", "Best practices", "Appendix"

Order them so each one is usable knowledge on its own, and so the later ones
depend on the earlier ones. End with a unit about how the thing breaks — it is
the highest-value material and it needs everything before it.

Show the outline and say what you deliberately left out. But **do not stop
there waiting for approval** — an outline is hard to judge in the abstract.
Keep going and draft the first walkthrough and the first unit, then hand over
both together. Confirmation gates the remaining eight units, not the first
sample; reacting to real content is how someone discovers the outline is wrong.

### 2. Write a walkthrough first

Walkthroughs are the format this app exists for: one real sequence of events,
traced end to end, with the reader predicting each step before it is revealed.

Writing one first forces you to understand how the pieces actually interact,
which is what makes the exercises afterwards good rather than trivia. If you
cannot write the walkthrough, you do not understand the subject well enough to
write the pack yet — go read more.

Aim for one walkthrough per major flow, 8–9 steps, 4–6 predictions placed where
someone's intuition is most likely to be wrong. See the walkthrough guidance in
`AUTHORING.md`.

### 3. Write the units

One at a time, 3–4 concepts each, 4–5 exercises per concept. Do not batch all
ten units into one pass — quality falls off a cliff and you will not notice.

For each concept: a `brief` that builds the mental model, 2–3 `examples` with
real artifacts, then exercises that test consequences of that model.

### 4. Add glossary terms

As you write, collect the vocabulary a newcomer would not know and add it to
`content/glossary.json` with a one-line plain-language definition. A term that
appears in a brief and is not in the glossary is a small hole someone falls
into mid-session.

Do not define jargon with more jargon. "A Lease is a coordination.k8s.io object
used for liveness" is useless. "A tiny object a node updates every 10 seconds to
say 'I am still alive'" is not.

### 5. Register and validate

Scaffolding is boilerplate; use the bundled script so you cannot forget to
register the pack:

```bash
python .claude/skills/ako-pack/scripts/scaffold_pack.py <pack-id> "<Title>" --emoji "🏗️"
```

It creates the directory, writes a `pack.json` stub and adds the pack to
`content/packs.json`. Then, after writing content, always:

```bash
python tools/validate.py
```

It fails on bad answer indexes, duplicate ids, missing explains and unresolvable
concept references. Do not hand over content that has not passed it.

## The voice

This is the part that decides whether the pack is worth anything.

### Ask about consequences, not definitions

The test: could someone answer correctly by recognising a word, without
understanding anything?

- ❌ "What is etcd?"
- ✅ "The API server is down on all three control-plane nodes. Which of these still work?"

- ❌ "What does a PodDisruptionBudget do?"
- ✅ "A Deployment has 2 replicas and a PDB with `minAvailable: 2`. You drain a node hosting one of them. What happens?"

The second version of each is answerable only by someone who has the model. It
also teaches something even when answered wrong, which the first does not.

### Put a real artifact in the question

Command output, a manifest, a log line, an error message. Recognising the shape
of a real failure is most of the actual skill, and it is the thing a textbook
cannot give you.

```
Error from server (Forbidden): pods is forbidden:
  User "raz" cannot list resource "pods" in API group "" in the namespace "prod"
```

A question built on that teaches more than three paragraphs about RBAC.

### Make the wrong answers plausible

A distractor should be something a competent person might genuinely believe.
"The scheduler emails the kubelet" is not a distractor, it is filler. If three of
your four options are obviously absurd, the question tests nothing.

### `explain` is the highest-value text in the file

It is read at the exact moment someone was wrong, which is the moment they are
most able to learn. Use it to add something new — the underlying reason, the
practical consequence, what to do about it — not to restate the answer.

- ❌ "Correct. Only the API server talks to etcd."
- ✅ "Only kube-apiserver. Every other component — including the scheduler and
  controller-manager — reaches etcd *through* it. That is what makes
  authn/authz/admission unavoidable and lets you audit every change in one place."

### Mix the exercise types

Each type does something the others cannot, so reach for the one that matches
the shape of the knowledge:

| Type | Use it for |
|---|---|
| `order` | lifecycles, request paths, recovery procedures — anything sequential |
| `match` | who-does-what across a set of components, symptom → cause |
| `fill` | commands and field names that should be in muscle memory |
| `multi` | "which of these are true" where the boundary is the lesson |
| `mcq` | judgement calls and diagnoses |

A unit that is 100% `mcq` is a sign you defaulted rather than chose. Some `mcq`
dominance is fine — it is the most flexible type — but if you have written a
lifecycle and not made it an `order`, you missed one.

## Accuracy

Wrong content is worse than no content, because it is learned confidently and
repeated in incidents.

- **Never invent command output.** If you are not confident what
  `kubectl get endpointslices` actually prints, either use a form you are sure
  of or leave the artifact out. Plausible-looking fabricated output is the worst
  possible outcome — it is memorised as real.
- **Prefer things that are stable.** Architecture and mechanism age well; exact
  flag defaults and version numbers do not. When you do cite a default, say it
  is a default.
- **Flag what you are unsure about** to the user rather than smoothing over it.
  A short "I'm not certain of the default for X, worth checking" is far more
  useful than a confident wrong number.

## Before you hand it over

Read your own questions as if you were sitting on a bus with three minutes and
no motivation. Then check:

- Could any question be answered by keyword-matching? Rewrite it.
- Does every concept have at least one real artifact?
- Does any `explain` merely restate the answer? Rewrite it.
- Is every term a newcomer would not know either explained inline or in the glossary?
- Did you write at least one walkthrough?
- Does `python tools/validate.py` pass with no errors?

Then tell the user what you left out and what you were unsure about. A pack with
six honest units beats one with ten padded ones.
