--liquibase formatted sql

--changeset sprints:1.0.0-7
WITH ordered AS (
    SELECT
        id,
        team_key,
        ROW_NUMBER() OVER (
            PARTITION BY team_key
            ORDER BY display_order, created_at, id
        ) - 1 AS new_order
    FROM tasks
)
UPDATE tasks t
SET display_order = ordered.new_order
FROM ordered
WHERE t.id = ordered.id;
