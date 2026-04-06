# Architecture Overview

## Stack

- Frontend: React + TypeScript + MUI + RTK Query
- Backend: Spring Boot + JPA/Hibernate
- Database: PostgreSQL + Liquibase migrations

## Main domains

- Quarters and sprints
- Participants and their rates/roles/user streams
- Tasks, task participants, task loads, task allocations
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
  Main task planning screen. Edits tasks, participants, sprint allocations, and filters.

- `src/views/ParticipantWorkloadPage.tsx`
  Participant-centric workload view built on top of capacity and task allocations.

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
3. Backend loads task details, participants, loads, allocations, streams, and customers.
4. Frontend renders task cards and participant rows.

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

There is still one legacy path that can bypass the participant-first model:

- `POST /taskload`

That endpoint can write `task_loads` directly without rebuilding participant allocations.

For future features such as auto-distribution, this is the main source of model ambiguity:

- allocations imply loads
- direct load writes do not imply allocations

## Implication for future auto-distribution

The safest direction is:

- treat `task_allocations` as the source of truth for planning
- derive `task_loads` from allocations
- run any auto-distribution logic as an allocation-generation step

Detailed backend notes are documented in `server/docs/task-load-allocation-architecture.md`.
