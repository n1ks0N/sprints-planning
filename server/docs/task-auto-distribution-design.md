# Planning Workbench Auto-Distribution Design

## Current architecture

The current user-facing planning flow works over a dedicated planning backlog table and only creates live tasks on final apply.

Relevant backend entry points:

- `GET /{teamKey}/planning-workbench/backlog`
- `POST /{teamKey}/planning-workbench/items`
- `PUT /{teamKey}/planning-workbench/items/{itemId}`
- `POST /{teamKey}/planning-workbench/preview`
- `POST /{teamKey}/planning-workbench/apply`

Core service:

- `server/src/main/java/com/sber/isu/sprints_planning/service/PlanningWorkbenchService.java`

Solver adapter:

- `server/src/main/java/com/sber/isu/sprints_planning/service/planning/AlgorithmPlanningSolver.java`

## Domain model

The planning workbench has its own persistence model:

- table: `planning_backlog_items`
- entity: `PlanningBacklogItemEntity`
- repository: `PlanningBacklogItemRepository`

Stored fields:

- title
- description
- dod
- priority
- customers
- streams
- planning_demands
- planning_quarter_ids
- planning_sprint_ids
- release_date_id
- initial_quarter_id
- display_order
- created_at
- updated_at

This removes the old overlap with live `tasks`.

Current sources of truth are now clearly split:

- planning backlog source of truth: `planning_backlog_items`
- live task load source of truth: `task_allocations`
- live task sprint totals: `task_loads`

Live task planning columns still exist for backward compatibility, but planning workbench no longer reads or writes them.

## Planning candidate selection

`PlanningWorkbenchService.getBacklogCandidates(...)` now reads only `planning_backlog_items`.

This means the planning page no longer includes:

- live tasks in status `backlog`
- live tasks without allocations
- any other live backlog task

The overlap between planning workbench and live backlog is intentionally removed.

## Planning demands

Each planning item is planned through `planning_demands`.

Each demand row is either:

- `ROLE`
- `PARTICIPANT`

and also carries:

- its own whole-day estimate
- its own participant stream

Examples:

- `ROLE: DEV / Core = 5`
- `ROLE: QA / Mobile = 3`
- `PARTICIPANT: Иван Петров / Core = 2`

Planning item total estimate is derived as the sum of all planning demands.

Demand stream semantics:

- demand-level `stream` means participant stream
- planning-item task streams are metadata of the future backlog task
- task streams must not be used as fallback participant-stream filters
- therefore a role demand with empty demand stream matches all participants with the required role, regardless of their participant streams

The planning dialog no longer exposes one explicit `assignment mode` switch.
Mode is derived from the demand rows:

- only participants -> `SPECIFIC_PARTICIPANTS`
- exactly one role row -> `ROLE_STREAM`
- mixed rows -> no flat legacy mode, solver still uses demand rows directly

New-task defaults:

- `priority = 1`
- `initialQuarterId` = value from localStorage if present
- otherwise `initialQuarterId` = current quarter
- `planningQuarterIds` default to the same value as `initialQuarterId`

Planning items with zero estimate and no demand rows are valid.
They stay in planning backlog until the user either fills them or publishes them as zero-load live tasks.

## Planning window

A planning item can constrain solver scope through:

- explicit `planning_sprint_ids`
- explicit `planning_quarter_ids`
- fallback `initialQuarterId`

Resolution order in backend:

1. `planning_sprint_ids`
2. `planning_quarter_ids`
3. `initialQuarterId`

If no planning window can be resolved, preview is rejected.

## Solver input

`PlanningWorkbenchService.preview(...)` converts selected planning items into one or more `PlanningDraftTask` records.

Conversion rule:

- one planning-item demand row -> one solver draft item

That means a single planning item can fan out into multiple solver items and then be merged back into one allocation matrix by `itemId`.

For each demand row it passes:

- task id
- title
- priority
- rounded whole-day estimate for this exact demand row
- derived assignment mode
- role if the row is role-based
- one concrete participant id if the row is participant-based
- demand-level participant stream
- release milestone dates
- allowed sprint ids

Committed workload is aggregated from existing live allocations:

- grouped by participant and sprint
- there is no self-subtraction anymore, because planning items are not live tasks yet

## Solver behavior

Current solver implementation is global and session-like in behavior, even though the input comes from planning backlog items rather than live tasks.

It accounts for:

- whole-day allocations only
- task priority
- release deadlines and release milestones
- participant order for explicit assignments
- role and stream candidate filters
- already committed workload
- sprint capacity based on participant rate and sprint working days

Important business rules:

- tasks with `priority = 3` are still part of workload calculations
- live tasks with status `backlog` are not planning candidates anymore
- workload/capacity still excludes live `backlog` tasks
- planning items are not part of workload until apply creates real tasks

## Solver sequence

The current `AlgorithmPlanningSolver` works in this order:

1. Load native OR-Tools CP-SAT runtime.
   - If the native runtime is unavailable, only then the service falls back to the deterministic heuristic.
   - Model/construction errors are not hidden by fallback.
2. Convert every selected planning-item demand row into a solver task.
   - A planning item with three demand rows becomes three solver tasks with the same item id.
   - Results are merged back by planning item id.
3. Resolve planning window for every solver task.
   - Explicit sprint ids have priority.
   - Then quarter ids.
   - Then initial quarter.
4. Build working-day slots from allowed sprints.
   - Slots after release date are removed.
   - Sprint headers in UI show both sprint dates and sprint name.
5. Resolve candidates.
   - Participant demand uses the explicit participant.
   - Role demand uses participants matching role.
   - Demand-level participant stream is applied only when explicitly set.
   - Task-level stream is metadata and is not used as participant-stream fallback.
6. Build integer CP-SAT variables.
   - One variable means one whole day assigned to one participant in one sprint slot.
   - Unplanned-day variables are allowed but heavily penalized.
7. Add hard constraints.
   - One day can be assigned to exactly one option or marked unplanned.
   - Sprint/participant capacity is limited by `capacity - committed workload`, with overload represented separately.
   - Explicit participant chains keep participant order.
8. Minimize weighted objective.
   - Highest penalty: unplanned days.
   - Then overload.
   - Then late placement, weighted by priority and release milestones.
   - Then fragmentation across many sprints/participants.
9. Convert solver result back to allocation matrix.
   - Matrix shape is `planningItemId -> participantId -> sprintId -> whole days`.
   - Preview uses this matrix for review and final apply.

## Preview output

`PlanningWorkbenchPreviewDto` returns:

- selected item ids
- sprint ids participating in the preview
- solve summary
- warnings
- planning items with generated `loads` and `allocations`
- participant workload summary
- `canApply`

The frontend review page keeps this preview client-side and allows manual cell edits before apply.
The review page state is persisted in `sessionStorage` per team, so reload restores both the original preview and local review edits.
It also renders a bottom preview list of future backlog tasks in backlog-like format: task card plus participant rows and sprint columns.

## Apply semantics

`PlanningWorkbenchService.apply(...)` validates the user-edited allocation matrix and then creates live tasks through `TaskService.create(...)`.

Validation includes:

- selected planning items must exist
- participant must belong to the allowed candidate pool
- if a demand row specifies participant stream, the selected explicit participant must also contain that stream
- sprint must belong to the planning-item window
- allocation must not lie after the release deadline
- total assigned days must equal total demand days for that planning item

When apply writes a task:

- `loads` are recalculated from the submitted allocation matrix
- `participantIds` are derived from explicit demand rows plus chosen executors
- if the original planning item contained role-based demand rows, apply materializes them into `PARTICIPANT` demand rows from the approved allocation matrix before calling `TaskService.create(...)`
- selected planning item is deleted from `planning_backlog_items`

Special status rule:

- if the created task has positive load, backend creates it as `inprogress`
- if the created task has zero load, backend creates it as `backlog`

## Review page contract

The review page must show:

- generated task allocation matrix
- committed load
- draft load
- total load
- overload
- free capacity
- a bottom list of backlog tasks that will be created on apply, with rows as participants and columns as sprints

Manual cell edits are allowed before apply, but backend remains the final validator.

## Why this design is correct for the current codebase

This workbench architecture fixes the previous dual-source problem because:

- planning metadata no longer mutates live tasks before publish
- live backlog tasks keep their own lifecycle, including status `backlog`
- workbench preview is computed from planning items plus committed workload only
- publish is explicit and one-way: planning item -> real task

## Participant reference dictionaries

Participant metadata now has additive reference tables:

- `participant_role_values`
- `participant_stream_values`

They are maintained from `ParticipantService` on participant create/update and exposed through `FiltersService`.

This is intentionally soft-normalization:

- `participants.role` and `participant_user_streams` remain the operational source attached to each participant
- reference tables provide centralized option lists for planning/team UI and filters
- `ParticipantService` removes reference values that are no longer used by any participant in the team

## Known boundaries

The workbench now supports multiple planning demand rows per planning item, but it still does not model explicit dependency graph semantics between those rows.

For example, if later the product needs:

- BA must finish before SA
- SA must finish before DEV
- DEV must finish before QA

that should be implemented as a richer demand/dependency model, not by overloading flat demand rows.

## Verification strategy

Current planning verification is intentionally split into three layers.

### 1. Java backend tests

Primary entry points:

- `server/src/test/java/com/sber/isu/sprints_planning/service/planning/AlgorithmPlanningSolverTest.java`
- `server/src/test/java/com/sber/isu/sprints_planning/service/PlanningWorkbenchServiceTest.java`
- `server/src/test/java/com/sber/isu/sprints_planning/controller/PlanningWorkbenchControllerTest.java`

Covered concerns:

- solver invariants for priority, role/stream matching, explicit participant sequencing, and fallback behavior
- service-level conversion from planning items to solver draft tasks
- preview/apply orchestration and validation rules
- controller routing and team-key normalization

Recommended command:

- `cd server && mvn -q -Drevision=0.1.0 test -Dtest=AlgorithmPlanningSolverTest,PlanningWorkbenchServiceTest,PlanningWorkbenchControllerTest`

### 2. Fast mocked browser e2e

Entry point:

- `tests/e2e/planning.spec.ts`

Covered concerns:

- planning page interactions
- preview-page draft behavior
- `sessionStorage` restore
- review edits and apply payload shape
- warnings and disabled/enabled apply states

Important limitation:

- these tests replace backend responses in the browser and therefore validate the frontend contract, not the live Spring Boot runtime

Recommended command:

- `npm run e2e`

### 3. Real-backend browser e2e

Entry points:

- `tests/e2e/planning.real.ts`
- `playwright.real.config.ts`

Covered concerns:

- real HTTP seeding of teams, quarters, sprints, participants, releases, backlog tasks, and planning items
- preview generation by the real `PlanningWorkbenchService`
- real solver output in the browser
- apply creating real backlog tasks with persisted `loads` and `allocations`

Current real scenarios:

1. `preview -> reload -> apply`
2. warning path with manual task removal from preview and recalculation
3. priority path under constrained shared capacity

Recommended command:

- `npm run e2e:real`

Operational note:

- real e2e requires a running local backend and PostgreSQL on the default project ports
- tests create isolated temporary teams and remove them after completion
