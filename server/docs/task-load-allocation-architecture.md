# Task Load And Allocation Architecture

## Why this matters

The project already stores task effort at two levels:

- task total effort per sprint
- participant effort per sprint

Any auto-distribution feature must decide which layer is authoritative and how synchronization works.

## Persistent model

### `tasks`

Stores task metadata:

- title, description, DOD
- priority, status
- initial quarter, release, leader
- legacy scalar `stream` and `customer`
- modern many-to-many `streams` and `customers`

### `task_participants`

Stores the list of participants linked to a task and their display order.

### `task_allocations`

Granularity:

- one row per `task + participant + sprint`

Meaning:

- participant-specific planned effort in sprint days

Entity:

- `TaskAllocationEntity`

### `task_loads`

Granularity:

- one row per `task + sprint`

Meaning:

- total planned effort for the task in the sprint

Entity:

- `TaskLoadEntity`

## Current write paths

### Task create / update

Files:

- `server/src/main/java/com/sber/isu/sprints_planning/service/TaskService.java`
- `server/src/main/java/com/sber/isu/sprints_planning/dto/request/TaskCreateRequest.java`
- `server/src/main/java/com/sber/isu/sprints_planning/dto/request/TaskUpdateRequest.java`

Behavior:

- create/update may receive both `loads` and `allocations`
- `applyLoads(...)` runs first
- `applyAllocations(...)` runs second
- `applyAllocations(...)` calls `recalcLoad(...)`

Implication:

- if both are sent for the same sprint, allocations win and overwrite the total load

### Single allocation update

Endpoint:

- `POST /{teamKey}/taskalloc`

Payload:

- `taskId`
- `participantId`
- `sprintId`
- `days`

Behavior:

- upserts one allocation cell
- recalculates the task total load for the sprint

### Bulk allocation update for one participant

Endpoint:

- `POST /{teamKey}/taskalloc/bulk`

Payload:

- `taskId`
- `participantId`
- `allocations: sprintId -> days`

Behavior:

- updates a whole participant row
- recalculates task total loads sprint by sprint

### Bulk allocation update for many participants

Endpoint:

- `POST /{teamKey}/taskalloc/bulk/multi`

Payload:

- `taskId`
- `allocations: participantId -> sprintId -> days`

Behavior:

- updates a full task allocation matrix
- recalculates task total loads sprint by sprint

### Direct task load update

Endpoint:

- `POST /{teamKey}/taskload`

Behavior:

- writes `task_loads` directly
- does not rebuild participant allocations

This is the main legacy inconsistency in the current architecture.

## Current read paths

### Backlog API and UI

Files:

- `server/src/main/java/com/sber/isu/sprints_planning/repository/TaskRepositoryImpl.java`
- `server/src/main/java/com/sber/isu/sprints_planning/mapper/DtoMapper.java`
- `src/views/BacklogPage.tsx`

Returned task shape:

- `loads: sprintId -> days`
- `allocations: participantId -> sprintId -> days`

Frontend behavior:

- participant rows are rendered from `allocations`
- task sprint totals are re-summed from participant rows in the UI
- quarter derivation uses positive allocations first, then loads, then `initialQuarterId`

### Capacity

Files:

- `server/src/main/java/com/sber/isu/sprints_planning/service/CapacityService.java`
- `server/src/main/java/com/sber/isu/sprints_planning/repository/TaskAllocationRepository.java`

Capacity uses:

- `task_allocations` only

It does not read `task_loads`.

Implication:

- participant allocations drive real workload calculations
- direct `task_loads` edits can become invisible to capacity if allocations are not aligned

## Operational invariants

The code currently behaves as if these rules are true:

1. Positive allocations imply the task participates in planning for that sprint.
2. Task total load for a sprint should equal the sum of participant allocations in that sprint.
3. Removing a participant removes their allocations and then recalculates task loads.

But one rule is not fully enforced:

4. Direct edits to `task_loads` can temporarily break the participant-first model.

## Architectural conclusion

The real planning source of truth is already close to:

- `task_allocations` = authoritative
- `task_loads` = derived cache / convenience total

That is the correct place to build auto-distribution.

## Constraints for auto-distribution

Any auto-distribution feature should:

1. Read the task participant set from `task_participants`.
2. Generate or rewrite `task_allocations`.
3. Recalculate `task_loads` from allocations.
4. Preserve manual edits unless the chosen UX explicitly says "redistribute and overwrite".
5. Be deterministic enough that repeated runs on unchanged input give the same result.

## Product decision that must be made first

There are two different meanings of "auto-distribute" in the current system:

1. Split an already known task total load across participants.
2. Rebalance an already existing participant allocation sum across participants.

Because the current UI mostly edits participant allocations directly, the second interpretation is already naturally supported by the model.

The first interpretation is only clean if the product explicitly defines the source total per sprint:

- existing `task_loads`
- current summed allocations
- newly entered total values in a dedicated UI

Without this decision, the backend can implement an algorithm but the feature semantics will stay ambiguous.

## Good API shapes for future work

Two practical options fit the current backend best.

### Option A: explicit action endpoint

Example:

- `POST /{teamKey}/tasks/{taskId}/auto-distribute`

Payload could contain:

- sprint scope
- strategy
- overwrite mode
- locked participant cells

Backend would:

- load task + participants + allocations
- compute new allocation matrix
- persist through the same logic as bulk multi update

### Option B: preview + apply

Two-step flow:

- preview distribution
- apply accepted matrix

This is safer if the distribution logic becomes non-trivial.

## Simplification recommendation

Before or during auto-distribution, consider deprecating direct task load editing as a primary write path.

Target model:

- user edits allocations
- total task load is always derived

This removes the biggest ambiguity in the current architecture and makes auto-distribution a natural extension instead of a parallel model.
