# Project Docs

This directory is the top-level documentation entry point for the project.

## Current docs

- `docs/architecture.md`
  General project architecture: frontend, backend, data model, and major runtime flows.

- `server/docs/README.md`
  Backend documentation index.

- `server/docs/task-load-allocation-architecture.md`
  Detailed description of how tasks, loads, allocations, and capacity currently work.

- `server/docs/task-auto-distribution-design.md`
  Proposed backend design for smart task auto-distribution.

## Documentation rules

- Root `docs/` stores cross-cutting and product-level architecture.
- `server/docs/` stores backend/domain-specific details.
- New features should extend existing docs instead of scattering ad-hoc notes in random files.
