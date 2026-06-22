# Project Docs

This directory is the top-level documentation entry point for the project.

## Current docs

- `docs/architecture.md`
  General project architecture: frontend, backend, data model, and major runtime flows.

- `docs/planning-workbench-overview.md`
  Product-level overview of the current planning workbench, global auto-distribution workflow over the separate planning backlog, and the automated test contours for planning.

- `docs/database-normalization-roadmap.md`
  Roadmap for improving the database schema toward stronger normal forms, stricter constraints, and safer planning data persistence.

- `server/docs/README.md`
  Backend documentation index.

- `server/docs/task-load-allocation-architecture.md`
  Detailed description of how tasks, loads, allocations, and capacity currently work.

- `server/docs/task-auto-distribution-design.md`
  Detailed backend design for planning workbench auto-distribution and solver integration.

## Documentation rules

- Root `docs/` stores cross-cutting and product-level architecture.
- `server/docs/` stores backend/domain-specific details.
- New features should extend existing docs instead of scattering ad-hoc notes in random files.
