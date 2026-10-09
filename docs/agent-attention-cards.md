# User attention cards

The canonical templates and rules for asking the user something. `AGENTS.md`
says when a card is required; this file says how to write and raise one. Read
it before writing any card.

When the user must notice and respond to a proposed follow-up, a material
choice, a permission boundary, or a blocker, use exactly one of the four cards
below. Never bury one inside a general summary or a vague "human review" note.

The English labels name the semantic fields; they are not fixed user-facing
copy. Render every visible heading, field label, option, recommendation, and
reply token in the language already used with the user, and keep code,
commands, paths, identifiers, and quoted source text in their required form.

Surround every card with a standalone `---` before its heading and another
after its final response line; consecutive cards may share one rule. The emoji
supplements the heading and never replaces it. Use one card per requested
decision, and end with an exact response format the user can copy.

## Raise the card through the question tool

A card written only as Markdown is a message, and a message ends the turn. The
agent stops, the client shows the session as finished, and a genuinely blocking
decision looks answered. The card is the record; it is not the asking.

So whenever the client offers a native structured-question facility, put the
question through it. The tool call is what holds the turn open and what puts
the session in the *needs you* column. Map the card onto it directly: the heading becomes the question, each row of the options table
becomes one option with its tradeoffs as the description, and the recommended
option goes first, marked as recommended.

Write the card too, in the same turn. The tool renders a compact chooser; the
card carries the evidence and reasoning the chooser has no room for. The tool
alone strips the argument, the card alone never asks.

Fall back to the card alone only when the client has no such facility. A run
that wrote only the card has not asked, however clearly it was worded.

## Proposed issue

Use this card when the work uncovers a distinct, evidence-backed, implementable
improvement outside the accepted scope, valuable enough to preserve and not
already tracked. A research note under `docs/research/` does not replace it. Do
not propose issues for incidental observations, speculation, tracked work, or
anything completed within the current task. The card proposes backlog capture;
it never authorizes creating the issue.

```markdown
---

## 🆕 Proposed issue: <short title>

**What I need from you:** Approve, reject, or revise this issue proposal.

### Why this matters

<Explain the user or project impact in plain language.>

### Current situation

<Explain what happens today and the evidence found.>

### Proposed outcome

<Explain what should become possible or improve after implementation.>

### Why this is a separate issue

<Explain why it is valuable but outside the current task.>

### My recommendation

<Explain briefly why opening the issue is worthwhile.>

**Reply with:** `Approve issue`, `Reject issue`, or `Revise: ...`

---
```

## Decision needed

Use this card when the user must choose among materially different outcomes.
State why the choice cannot be made safely from existing evidence, show the
meaningful options and tradeoffs, and recommend one. Do not stop at "human
review needed."

```markdown
---

## 🧭 Decision needed: <question>

**What I need from you:** Choose one of the options below.

### Why this decision is needed

<Explain what cannot be decided safely without the user's preference.>

### Options

| Option | What it means | Advantages | Disadvantages |
| --- | --- | --- | --- |
| A: <name> | <plain explanation> | <benefits> | <tradeoffs> |
| B: <name> | <plain explanation> | <benefits> | <tradeoffs> |

### My recommendation

**Option <X>**, because <short evidence-based reason>.

**Reply with:** `Option A`, `Option B`, or `Revise: ...`

---
```

## Approval needed

Use this card when one exact action is already preferred but crossing a
permission, publication, destructive-operation, cost, privacy, or
external-mutation boundary requires approval. Name the exact target, expected
change, risk, reversibility, and recovery path. Approval covers only the stated
action.

```markdown
---

## 🔐 Approval needed: <exact action>

**What I need from you:** Approve or decline this specific action.

### Proposed action

<Describe exactly what will be changed, published, deleted, or executed.>

### Why it is needed

<Explain the benefit and why the action cannot be avoided.>

### Impact and safety

- **Target:** <exact repository, file, branch, service, or data>
- **Expected change:** <what will be different>
- **Risk:** <what could go wrong>
- **Reversible:** <yes or no, and how>
- **Recovery:** <how the previous state can be restored>

### My recommendation

<Recommend approval or rejection, with a short reason.>

**Reply with:** `Approve`, `Decline`, or `Revise: ...`

---
```

## Action needed

Use this card when work is blocked by one specific external action from the
user rather than by a choice or a permission decision. State what is blocked,
why you cannot continue, the smallest unblocking action, and the observable
condition for resumption.

```markdown
---

## ⛔ Action needed: <blocking condition>

**What I need from you:** <one specific action>.

### What is blocked

<Explain which requested work cannot continue.>

### Why I cannot continue

<Explain the verified blocker in plain language.>

### How to unblock it

1. <First exact action>
2. <Second action, only when necessary>

### I can continue when

<Describe the observable condition that confirms the blocker is resolved.>

---
```
