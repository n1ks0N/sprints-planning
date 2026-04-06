# Backend Docs

This directory stores backend- and domain-specific documentation.

## Current docs

- `server/docs/task-load-allocation-architecture.md`
  Current model of tasks, loads, allocations, filters, and capacity.

- `server/docs/task-auto-distribution-design.md`
  Proposed design for smart release-aware auto-distribution of task load by participants.

## Writing rules

- Document actual current behavior first.
- Separate domain invariants from proposed future changes.
- When a feature depends on an existing inconsistency, document the inconsistency explicitly instead of hiding it.
