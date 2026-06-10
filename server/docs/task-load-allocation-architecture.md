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

- allowed only for tasks that do not have participants and do not have participant allocations
- writes `task_loads` directly for unassigned backlog-level effort
- explicitly rejects direct writes once the task participates in participant planning

This keeps `task_allocations` authoritative for any participant-bound plan.

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

4. Direct edits to `task_loads` are only allowed before a task enters participant-level planning.

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

## Current planning workbench integration

The user-facing planning flow now works through `planning_backlog_items` and only creates live tasks on final apply.

Key consequence:

- the page where a manager prepares tasks for auto-distribution does not edit live `tasks`
- it edits dedicated draft records in `planning_backlog_items`
- preview generates a draft allocation matrix only in memory / browser session state
- live `task_allocations` and `task_loads` are touched only on final apply

Then:

1. the workbench preview converts selected planning items into solver input
2. the solver produces participant/sprint allocations
3. apply creates new live tasks through `TaskService.create(...)`
4. `task_allocations` are written on those created tasks
5. `task_loads` are recalculated from the new allocation matrix

This preserves the same core invariant:

- live planning truth remains `task_allocations`
- `task_loads` remain derived totals

Additional current rule:

- if a planning item was role-based during preview, final apply materializes those approved role allocations into concrete participant demand rows before task creation

This keeps created live tasks aligned with what the user approved on the review page.

## Fit for future planning sessions

The same allocation-first model is also the correct publication target for a future draft planning workflow.

Recommended rule:

- planning sessions keep their own draft allocations
- publish writes those allocations into real `task_allocations`
- real `task_loads` are recalculated from real allocations only at publish time

This gives a clean separation:

- draft planning data remains isolated during review
- production planning remains consistent after publish

That means the planning-session feature should reuse the current live allocation model as its final target, but it should not use live task tables as temporary draft storage.

## Current compatibility notes

Live tasks still keep legacy planning-related columns such as:

- `estimate_days`
- `planning_assignment_mode`
- `planning_role`
- `planning_quarter_ids`
- `planning_sprint_ids`
- `planning_demands`

These fields are still written on real tasks because:

- backlog editing still exposes planning metadata on created tasks
- the final published task should preserve the approved planning intent
- backward compatibility for older task-level flows is still required

But they are no longer the source of truth for the planning workbench itself.

Legacy scalar fields `tasks.customer` and `tasks.stream` are also still mirrored for compatibility with older read paths, but that compatibility is only partial:

- the real source of truth is now the many-value relation tables
- scalar legacy fields can hold only one value each
- backend currently mirrors the first normalized value into those scalar columns
- therefore a rollback to older code can only observe one customer and one stream per task
