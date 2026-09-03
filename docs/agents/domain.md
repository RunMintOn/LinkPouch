# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repo root, or `CONTEXT-MAP.md` if it exists. For a map, read each relevant context file.
- `docs/adr/`: read ADRs that touch the area being explored.

If these files do not exist, proceed silently. Create them only when domain terms or decisions are resolved.

## Layout

This is a single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulary and decisions

Use terms defined in `CONTEXT.md` in issue titles, refactor proposals, hypotheses, and test names. If a needed concept is missing, note the gap for domain modeling.

If output contradicts an existing ADR, state the conflict explicitly instead of silently overriding it.
