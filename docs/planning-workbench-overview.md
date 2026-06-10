# Planning Workbench Overview

## Product flow

The planning feature now uses its own persistence model and no longer overlaps with live backlog tasks.

User scenario:

1. The left column shows the common planning backlog from a dedicated table.
2. The right column holds the current selection of planning items the manager wants to solve now.
3. Tasks can be moved from left to right with explicit action buttons.
   - `Все в план` moves every visible planning item into the current solve set
   - `Все убрать` clears the current solve set
   - individual planning items can be deleted from either column
4. Planning items can be created from either side:
   - if an item is created from the right side, it is still saved into the common planning backlog
   - the right-side selection is not persisted, so after a page reload the item appears in the left planning backlog again
5. The page also supports client-side filtering by quarter and sorting by:
   - manual order
   - total demand
   - release date
   - priority
6. The manager runs one common action:
   - `Автораспределение нагрузки`
7. The backend computes one global plan for the selected planning items.
8. The user opens a review page with:
   - generated sprint allocations
   - per-participant workload summary
   - overload and free capacity indicators
   - a bottom preview list of backlog tasks that will be created after approval
   - sprint columns with sprint dates and names
9. The review state is stored in `sessionStorage` per team:
   - the raw preview survives reload
   - local review edits also survive reload
   - nothing is published until explicit confirmation
10. After confirmation, backend creates real backlog tasks from the selected planning items and writes allocations and total sprint loads.

## What is edited on the planning page

The planning page is intentionally lighter than the backlog page.

Selection fields now reuse the same autocomplete behavior as the backlog filters:

- the dialog uses the shared `FilterAutocomplete` component
- multi-value fields behave the same way as backlog filter chips
- single-choice planning fields use the same searchable select style instead of separate experimental controls

It edits only planning-item metadata:

- title
- description
- DoD
- priority
- start quarter
- release
- task stream
- customer
- planning demands:
  - there is no explicit "assignment mode" field in UI
  - each row is selected through one combined field: `Роль / Участник`
  - rows are added by one common `Добавить` button
  - a new row reuses the same role/participant value as the previous row
  - each row is either a role or a concrete participant
  - each row also carries its own participant stream
  - each row has its own whole-day estimate
  - overall estimate is derived automatically as the sum of all rows
- allowed planning window:
  - planning quarter defaults to the selected start quarter
  - planning quarters
  - explicit planning sprints

It does not show or edit sprint allocations directly.

Sprint allocations appear only on the review page and on the main backlog page after apply.

## Defaulting rules

For a new task in the planning dialog:

- priority defaults to `1`
- start quarter is restored from localStorage first
- if localStorage does not contain a quarter, the current calendar quarter is used
- planning quarter defaults to the same value as start quarter

Planning items may also be created without any demand rows at all:

- no participant or role is required at creation time
- total estimate may be `0`
- such items remain valid planning backlog entries, but are not ready for meaningful auto-distribution until demand rows are added

## Separation from live backlog

Live tasks are no longer used as planning-workbench source data.

Important behavior now:

- tasks with status `backlog` stay regular backlog tasks
- they are not auto-imported into planning workbench
- the left planning list is backed by a separate table
- the only place where planning touches live tasks is final `apply`

## Planning demand rules

Each planning demand row is either:

- a concrete participant
- or a role

That means one task can now contain a mixed set such as:

- `DEV = 5`
- `QA = 3`
- `Иван Петров = 2`

The page no longer exposes one task-level "assignment mode" control.
Mode is derived implicitly from the demand rows.

Important stream rule:

- task stream and participant stream are different fields
- a role demand without `Стрим по участнику` matches participants by role only
- the task-level stream is not used as an implicit participant-stream restriction

## Review and publish details

The review page keeps editable draft metadata for future backlog tasks:

- title
- description
- DoD
- priority
- quarters
- release
- customers
- task streams
- participant rows and sprint allocations

When the user confirms, these edited values are sent with the allocation matrix.

Quarter persistence rule:

- if the user selected planning quarters, they are written into the created backlog task
- if only concrete sprints were selected, backend derives quarters from the allocated sprint ids
- if there is still no derived quarter, backend falls back to the initial quarter

Planning demands are now stored directly on the planning item.

Apply materialization rule:

- if the planning item already contains explicit participant demand rows, they are passed through
- if the planning item contains role-based demand rows, final apply converts them into concrete participant demand rows from the approved allocation matrix
- this is required so the created backlog task keeps the same participant set and participant-level load that the user saw on the review page

## Participant dictionaries

Participant roles and participant streams are now backed by separate reference tables:

- `participant_role_values`
- `participant_stream_values`

These dictionaries are populated from participant create/update operations and are exposed through the filters payload.
Unused values are removed again when no participant in the team references them anymore.

Current use:

- planning dialog role options come from participant role dictionary
- planning dialog participant-stream options come from participant stream dictionary
- team page autocomplete options reuse the same dictionaries

## Why this architecture fits the current product

This approach removes the old dual-source problem:

- planning metadata no longer mutates live tasks before publish
- sprint loads and allocations remain live-task data only
- planning backlog has its own single source of truth
- live backlog tasks, including status `backlog`, stay regular tasks and are not mixed with planning items

Detailed backend design is documented in:

- `server/docs/task-auto-distribution-design.md`

## Automated verification

Planning is now covered by three complementary automated test layers.

### 1. Fast mocked browser e2e

Command:

- `npm run e2e`

Entry point:

- `tests/e2e/planning.spec.ts`

Purpose:

- verify the full frontend flow quickly and deterministically
- verify `planning -> preview -> apply` UI behavior
- verify `sessionStorage` restore on the preview page
- verify review-page edits, task removal from preview, warning rendering, disabled/enabled apply states
- verify that the frontend sends the expected payload shape to backend endpoints

Important constraint:

- these tests replace backend responses with browser-side mocks
- they validate the UI contract and request/response flow, but not the real Spring Boot backend or the real solver

### 2. Real-backend browser e2e

Command:

- `npm run e2e:real`

Entry points:

- `tests/e2e/planning.real.ts`
- `playwright.real.config.ts`

Purpose:

- verify the same user-facing planning flow against the live backend
- seed teams, quarters, sprints, participants, releases, backlog tasks, and planning items through real HTTP API calls
- verify that preview is built by the real `PlanningWorkbenchService`
- verify that the real solver result appears in the UI
- verify that `apply` creates real backlog tasks with the expected `loads` and `allocations`

Current real scenarios:

1. `preview -> reload -> apply`
   - committed live load affects generated preview allocations
   - preview survives page reload through `sessionStorage`
   - final apply creates real backlog tasks
2. warning path with manual correction
   - an impossible planning item blocks apply
   - removing it from preview and recalculating makes apply available again
3. priority path under limited capacity
   - shared capacity is given to the higher-priority task
   - the lower-priority task remains unplanned and keeps apply disabled

Prerequisites:

- local frontend dev server must be startable by Playwright
- local backend and PostgreSQL must be running and reachable on the default project ports
- tests create dedicated temporary teams and remove them at the end

### 3. Backend planning tests

Command:

- `cd server && mvn -q -Drevision=0.1.0 test -Dtest=AlgorithmPlanningSolverTest,PlanningWorkbenchServiceTest,PlanningWorkbenchControllerTest`

Purpose:

- verify solver invariants directly on Java objects
- verify preview/apply orchestration in `PlanningWorkbenchService`
- verify controller contracts, team-key normalization, and request wiring

Why all three layers are needed:

- mocked e2e catches frontend regressions quickly
- real e2e proves the browser flow works against the live backend
- Java tests protect solver and service rules with more precise domain assertions
