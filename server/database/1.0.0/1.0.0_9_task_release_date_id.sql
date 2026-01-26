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

CREATE TABLE IF NOT EXISTS task_customers (
    team_key TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (team_key, name)
);
CREATE INDEX IF NOT EXISTS task_customers_name_idx ON task_customers(name);

CREATE TABLE IF NOT EXISTS task_streams (
    team_key TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (team_key, name)
);
CREATE INDEX IF NOT EXISTS task_streams_name_idx ON task_streams(name);

INSERT INTO task_customers (team_key, name)
SELECT DISTINCT team_key, customer
FROM tasks
WHERE customer IS NOT NULL AND btrim(customer) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO task_streams (team_key, name)
SELECT DISTINCT team_key, stream
FROM tasks
WHERE stream IS NOT NULL AND btrim(stream) <> ''
ON CONFLICT DO NOTHING;

DROP INDEX IF EXISTS tasks_stream_idx;

ALTER TABLE tasks
    ALTER COLUMN customer TYPE jsonb
    USING CASE
        WHEN customer IS NULL OR btrim(customer) = '' THEN '[]'::jsonb
        ELSE to_jsonb(ARRAY[customer])
    END;
ALTER TABLE tasks
    ALTER COLUMN customer SET DEFAULT '[]'::jsonb,
    ALTER COLUMN customer SET NOT NULL;

ALTER TABLE tasks
    ALTER COLUMN stream TYPE jsonb
    USING CASE
        WHEN stream IS NULL OR btrim(stream) = '' THEN '[]'::jsonb
        ELSE to_jsonb(ARRAY[stream])
    END;
ALTER TABLE tasks
    ALTER COLUMN stream SET DEFAULT '[]'::jsonb,
    ALTER COLUMN stream SET NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_stream_gin_idx ON tasks USING GIN (stream);
CREATE INDEX IF NOT EXISTS tasks_customer_gin_idx ON tasks USING GIN (customer);
