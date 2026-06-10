# Backend Docs

This directory stores backend- and domain-specific documentation.

## Current docs

- `server/docs/task-load-allocation-architecture.md`
  Current model of tasks, loads, allocations, filters, and capacity.

- `server/docs/task-auto-distribution-design.md`
  Current backend architecture for planning backlog items, solver integration, preview/review flow, and publish semantics.

## Writing rules

- Document actual current behavior first.
- Separate domain invariants from proposed future changes.
- When a feature depends on an existing inconsistency, document the inconsistency explicitly instead of hiding it.
