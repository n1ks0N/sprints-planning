# Architecture Overview

## Stack

- Frontend: React + TypeScript + MUI + RTK Query
- Backend: Spring Boot + JPA/Hibernate
- Database: PostgreSQL + Liquibase migrations

## Main domains

- Quarters and sprints
- Participants and their rates/roles/user streams
- Tasks, task participants, task loads, task allocations
- Planning backlog items and solver preview/apply flow
- Releases
- Jira export
- API history / task history

## Layered structure

### Frontend

Main state and integration points:

- `src/app/api.ts`
  RTK Query endpoints and optimistic updates.

- `src/app/uiSlice.ts`
  Persistent UI filters and page state.

- `src/views/BacklogPage.tsx`
  Main live backlog screen. Edits real tasks, participants, sprint allocations, filters, and Jira export selection.

- `src/views/CapacityPage.tsx`
  Capacity summary table by participant and sprint.

- `src/views/ParticipantWorkloadPage.tsx`
  Participant-centric task workload view built on top of live task allocations.

- `src/views/PlanningWorkbenchPage.tsx`
  Separate planning backlog screen for draft planning items before publish.

- `src/views/PlanningWorkbenchReviewPage.tsx`
  Review page for one generated global planning preview before final apply.

### Backend

Main layers:

- `controller/`
  HTTP entry points.

- `service/`
  Business logic and orchestration.

- `repository/`
  Persistence and custom filtering/aggregation.

- `model/`
  JPA entities.

- `dto/` and `mapper/`
  API contract and serialization mapping.

## Core planning model

The current task planning model has two related layers:

- `task_allocations`
  Participant-level planned effort per sprint.

- `task_loads`
  Task-level total planned effort per sprint.

In practice, participant allocations are the more authoritative planning layer:

- capacity is calculated from `task_allocations`
- most backlog edits update allocations first
- `TaskService.recalcLoad(...)` rebuilds `task_loads` from allocations

This means the system is already close to a participant-first planning model.

## High-level request flows

### Backlog read flow

1. Frontend requests tasks with filters.
2. Backend applies `TaskFilter` in `TaskRepositoryImpl`.
3. Backend returns a paged result from `TaskController.getTasks(...)`.
4. Backend loads task details, participants, loads, allocations, streams, and customers.
5. Frontend renders task cards and participant rows.

### Allocation write flow

1. Frontend edits one cell, one row, or multiple rows.
2. Frontend calls one of:
   - `POST /taskalloc`
   - `POST /taskalloc/bulk`
   - `POST /taskalloc/bulk/multi`
3. Backend updates `task_allocations`.
4. Backend recalculates `task_loads` for affected sprints.
5. Capacity and backlog views become consistent through the shared allocation data.

### Capacity read flow

1. Frontend requests capacity rows.
2. `CapacityService` aggregates workload from `task_allocations`.
3. Capacity is combined with participant rate and sprint working days.

## Important architectural observation

There is one remaining legacy path for unassigned effort:

- `POST /taskload`

Backend now allows it only for tasks without participants and without participant allocations.
For any participant-bound task, `task_allocations` remain the only planning source of truth and `task_loads` are derived from them.

For future features such as auto-distribution, the intended invariant is:

- allocations imply loads
- direct load writes are only valid before allocations exist

## API history

Backend request logging uses `ApiCallLoggingFilter`, but persistence of generic API history is now offloaded from the request thread.

Current model:

- request thread extracts minimal metadata
- `ApiHistoryService` persists generic API history asynchronously
- entity-specific audit entries such as task history remain explicit service-level writes

History read path also pages by session groups instead of loading the full team history into memory.

## Implication for future auto-distribution

The safest direction is:

- treat `task_allocations` as the source of truth for planning
- derive `task_loads` from allocations
- run any auto-distribution logic as an allocation-generation step

Detailed backend notes are documented in `server/docs/task-load-allocation-architecture.md`.

## Planning Workbench

The current user-facing planning flow uses a dedicated planning backlog table and only creates live tasks on final apply.

Main idea:

- left column: common backlog of tasks that are not yet planned
- right column: the current temporary selection for auto-distribution
- preview: backend computes one global plan for the selected tasks
- review: user adjusts generated sprint allocations and sees workload summary by participant
- apply: backend creates new live backlog tasks from selected planning items

Why this fits the current architecture:

- planning workbench has its own persistence model and does not mutate live tasks before publish
- created live tasks still use `task_allocations` as the planning source of truth
- `task_loads` stay derived from live allocations
- the right-side selection remains page-local and does not require backend persistence
- preview/review state is persisted only on the client side
- the overlap between planning workbench and live backlog is removed

Important domain additions for workbench planning:

- dedicated planning items are stored in `planning_backlog_items`
- live tasks may still keep planning-related columns for backward compatibility, but planning workbench no longer uses live tasks as its source data
- planning demand rows can carry:
  - role or explicit participant
  - per-demand participant stream
  - whole-day estimate
- start quarter defaults come from:
  - localStorage first
  - otherwise current quarter
- planning quarter defaults to the same value as start quarter
- planning page supports client-side quarter filtering and sorting by manual order, total demand, release date, or priority
- live tasks with status `backlog` remain regular backlog tasks and are not auto-imported into planning workbench
- preview and review draft edits are stored client-side in `sessionStorage` per team and are only published on explicit apply
- when apply creates a task with positive planned load, backend creates it as `inprogress`
- when apply creates a task with zero planned load, backend creates it as `backlog`
- when a planning item used role-based demand rows, final apply materializes them into concrete participant demands from the approved allocation matrix

Participant metadata also has additive reference dictionaries:

- `participant_role_values`
- `participant_stream_values`

These dictionaries do not replace `participants.role` or `participant_user_streams` in the live model.
They exist to provide centralized autocomplete option lists for filters and planning UI, and are cleaned up when no participant uses a value anymore.

The product-level planning flow is documented in `docs/planning-workbench-overview.md`.
The backend design and solver model are documented in `server/docs/task-auto-distribution-design.md`.
The automated planning test contours are documented in `docs/planning-workbench-overview.md`.
