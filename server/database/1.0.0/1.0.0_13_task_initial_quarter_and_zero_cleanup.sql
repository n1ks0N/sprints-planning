--liquibase formatted sql

--changeset sprints:1.0.0-13-task-initial-quarter-and-zero-cleanup

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS initial_quarter_id UUID;

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_initial_quarter_id_fkey;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_initial_quarter_id_fkey
        FOREIGN KEY (initial_quarter_id) REFERENCES quarters (id);

CREATE INDEX IF NOT EXISTS tasks_team_initial_quarter_idx
    ON tasks (team_key, initial_quarter_id);

DELETE FROM task_allocations
WHERE COALESCE(days, 0) <= 0;

DELETE FROM task_loads
WHERE COALESCE(days, 0) <= 0;

WITH positive_work AS (
    SELECT
        l.task_id,
        s.quarter_id,
        q.start_date AS quarter_start,
        s.start_date AS sprint_start
    FROM task_loads l
             JOIN sprints s ON s.id = l.sprint_id
             JOIN quarters q ON q.id = s.quarter_id
    WHERE COALESCE(l.days, 0) > 0

    UNION

    SELECT
        a.task_id,
        s.quarter_id,
        q.start_date AS quarter_start,
        s.start_date AS sprint_start
    FROM task_allocations a
             JOIN sprints s ON s.id = a.sprint_id
             JOIN quarters q ON q.id = s.quarter_id
    WHERE COALESCE(a.days, 0) > 0
),
     first_quarter AS (
         SELECT DISTINCT ON (task_id)
             task_id,
             quarter_id
         FROM positive_work
         ORDER BY task_id, quarter_start, sprint_start, quarter_id
     )
UPDATE tasks t
SET initial_quarter_id = fq.quarter_id
FROM first_quarter fq
WHERE t.id = fq.task_id
  AND t.initial_quarter_id IS NULL;
