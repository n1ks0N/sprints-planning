--liquibase formatted sql

--changeset sprints:1.0.2-1
ALTER TABLE tasks
    ADD COLUMN display_order INT NOT NULL DEFAULT 0;

UPDATE tasks t
SET display_order = seq.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS rn
    FROM tasks
) AS seq
WHERE t.id = seq.id;
