# All-view applicability audit

The procedure behind the rule of the same name in `AGENTS.md`, which says when
it applies.

Tabelo presents one synchronized document through a registry of views, so a
request that happens to name a view is naming an example far more often than it
is naming a boundary. Whenever a bug, feature, improvement, or direct fix names
or changes one or more views, audit every registered view before scope is
settled. This applies while an issue is captured, revised, planned, reviewed, or
implemented, and to direct work carrying no issue at all.

- **Enumerate from the registry, never from memory.** The current entries
  returned by `listViews()`, with their `kind`, capabilities, and associated
  codec or representation, are the list. Policy names the method so a view
  added later is included without editing this procedure; do not write today's
  view ids into any document as a second registry.
- **Give every entry exactly one outcome, each with a short reason**:
  applicable, unsupported by its capabilities or representation, explicitly out
  of scope, or unaffected. A missing capability flag is not by itself proof that
  a requested new capability is impossible: the reason comes from the
  representation and the accepted product contract, and one of those must be
  able to state it.
- **The audit authorizes analysis, not implementation.** Auditing every view
  never widens a direct request on its own. A capability reaches another view
  only when the accepted request and the product contract support it, and a
  material scope choice that the audit exposes goes to the user through the
  existing decision process rather than being resolved by implementing it.
- **Examples are not exclusions, and explicit limits bind.** Views named in a
  report are evidence of where the problem was seen, not proof that the others
  were considered and rejected. A user who explicitly limits implementation to
  selected views has decided: record the remaining views and respect the limit.
- **Keep the evidence proportional and put it where the work already reports.**
  A compact per-view list, or grouped entries that visibly account for every
  registered view, is enough. Record it in the canonical issue or in an
  already-authorized implementation handoff when it changes or constrains scope,
  and in the task's own report for direct work. No new artifact exists to hold
  it, and no backlog rewrite is authorized by this rule. A view-scoped phase
  cannot report complete while an applicability decision that materially affects
  scope is missing.
