# Smart Task Auto-Distribution Design

## Goal

Implement task auto-distribution that is not a naive equal split, but a planning heuristic that takes into account:

- release date and release cycle
- task priority
- phase sequence:
  - BA
  - SA
  - developers
  - tester
- existing participant workload

## Important conclusion

This is not just "split days between participants".

It is a constrained scheduling problem with:

- precedence between phases
- release-driven time windows
- role matching
- workload balancing

Because of that, the best implementation is a dedicated planning service, not a UI-only helper.

## Recommended source of truth

Use `task_allocations` as the authoritative planning model.

Reason:

- capacity already uses `task_allocations`
- backlog UI already edits participant allocations directly
- `task_loads` can be derived through `recalcLoad(...)`

## Recommended feature shape

### User interaction

The first version should be an explicit action:

- `Автораспределить`

The action should be task-scoped, not global.

It should not run automatically on every edit, because that would constantly override manual planning.

### Execution model

The backend should:

1. Load the task, participants, existing allocations, release, sprints, and current capacity/workload.
2. Build a phased plan for the task.
3. Allocate phase effort to specific participants and sprints.
4. Save allocations.
5. Recalculate task total loads.

## Planning model

### 1. Determine target total load per sprint

The algorithm needs a source total.

Recommended rule:

1. If the task already has positive participant allocations, use their summed total by sprint.
2. Otherwise, if the task has direct `task_loads`, use them as the initial total to distribute.
3. Otherwise, there is nothing to distribute.

This avoids introducing a second separate source of truth.

### 2. Split total task effort into role phases

The system must estimate how much of the task belongs to:

- BA
- SA
- DEV
- QA

Current domain model does not store this explicitly, so the first implementation needs configuration.

Recommended approach:

- introduce team-level phase weights

Example default profile:

- BA: 10%
- SA: 15%
- DEV: 55%
- QA: 20%

These values should be configurable, not hardcoded forever.

## Release-aware windows

### Problem

The current release model contains:

- `devStart`
- `devEnd`
- `iftStart`
- `iftEnd`
- `regressStart`
- `regressEnd`
- `promDate`

But it does not explicitly contain BA and SA windows.

### Recommended derived windows

For the first smart version:

- BA window:
  from "now or first visible sprint" up to `devStart`

- SA window:
  from BA start up to `devStart`, but after BA in sequence

- DEV window:
  `devStart .. devEnd`

- QA window:
  `iftStart .. regressEnd`

This must remain configurable because different teams may want QA only in `ift`, or in `ift + regress`.

## Priority effect

Priority should influence distribution pressure, not only filtering.

Recommended behavior:

- Priority 1:
  front-load into the earliest allowed sprints of each phase

- Priority 2:
  balanced distribution inside allowed windows

- Priority 3:
  lower urgency, distribute later and more evenly inside the allowed windows

This gives priority a real scheduling meaning without changing the existing priority model.

## Candidate selection by role

### Problem

`ParticipantEntity.role` is currently a free string.

That is not reliable enough for a smart planner unless we normalize it.

### Recommended solution

Introduce logical role groups used by the planner:

- `BA`
- `SA`
- `DEV`
- `QA`

Then add a mapping from raw participant role strings to these planner groups.

This mapping can be:

- code-level config for MVP
- team-level DB config later

Without this role mapping, "BA -> SA -> DEV -> QA" cannot be implemented robustly.

## Allocation scoring

Inside each phase window, choose the participant with the best score.

Recommended score components:

1. Role match
   hard requirement

2. Current workload in the sprint
   lower workload is better

3. Remaining capacity in the sprint
   more free capacity is better

4. Participant rate
   higher rate can carry more load

5. Continuity bonus
   if the same participant already has adjacent allocations for this task/phase, add a small bonus

6. Overload penalty
   if assigning the next chunk would exceed a threshold, penalize heavily

### Practical scoring example

For each candidate participant in a sprint:

- base score starts from remaining free capacity
- multiply by participant rate
- subtract current workload pressure
- add continuity bonus
- subtract overload penalty

This is heuristic, but deterministic and explainable.

## Sequencing rule

The planner should not assign later phases before earlier phases are materially placed.

Recommended rule:

- BA allocated first
- SA starts no earlier than BA start and preferably after BA has meaningful coverage
- DEV starts after SA has been placed into its valid window
- QA starts after DEV coverage exists and inside QA window

This does not need to be strict dependency graph scheduling in v1, but phase order must be respected.

## Persistence model

Recommended API:

- `POST /{teamKey}/tasks/{taskId}/auto-distribute`

Request payload:

- `mode`
  - `overwrite_all`
  - `fill_empty_only`

- `scope`
  - optional sprint ids

- `strategy`
  - `smart_release_priority_capacity`

- `lockedCells`
  - optional list of participant+sprint cells that must not be changed

Response:

- updated `TaskDto`
- plus planner summary:
  - used release
  - phase weights
  - cells changed
  - warnings

## Why preview is still recommended

Even with a good heuristic, this feature will make non-trivial changes.

The safest UX is:

1. preview
2. apply

If implementation needs to be phased, the first backend version can still execute directly, but the internal service should already produce a structured plan that can later be exposed as preview.

## Minimal implementation roadmap

### Phase 1

- backend-only smart planner service
- explicit task action button
- no background job
- no preview
- role mapping in code
- phase weights in code
- release-aware windows
- capacity-aware participant scoring

### Phase 2

- preview before apply
- locked cells
- configurable role mapping per team
- configurable phase weights per team

### Phase 3

- auto-redistribute only affected phases after task edits
- planner explanations in UI
- optimization improvements

## Recommended service structure

- `TaskAutoDistributionService`
  entry point, transaction orchestration

- `TaskPhasePlanner`
  builds BA/SA/DEV/QA phase demand from task totals and release

- `TaskDistributionScorer`
  scores candidate participant+sprint cells

- `TaskDistributionPersistence`
  writes resulting allocation matrix and calls `recalcLoad(...)`

This separation keeps the logic testable and avoids turning `TaskService` into a monolith.

## Main risks

1. Role strings are not normalized enough.
2. BA and SA windows are not explicitly modeled in release data.
3. Direct `task_loads` edits still exist as a parallel write path.
4. Without preview, users may perceive the result as opaque.

## Bottom line

The best implementation is:

- release-aware
- phase-based
- capacity-aware
- participant-allocation-first

Not a simple proportional split.
