--liquibase formatted sql

--changeset sprints:1.0.0-9
ALTER TABLE tasks ADD COLUMN release_date_id UUID;

UPDATE tasks t
SET release_date_id = r.id
FROM releases r
WHERE t.release_date IS NOT NULL
  AND r.prom_date = t.release_date;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_release_date_fk FOREIGN KEY (release_date_id) REFERENCES releases(id);

CREATE INDEX tasks_release_date_idx ON tasks(release_date_id);

DROP INDEX IF EXISTS tasks_release_sprint_idx;
ALTER TABLE tasks DROP COLUMN release_sprint_id;
ALTER TABLE tasks DROP COLUMN release_date;
