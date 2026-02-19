-- --liquibase formatted sql

-- --changeset sprints:1.0.0-2
-- CREATE TABLE api_call_history (
--     id UUID PRIMARY KEY,
--     session_id TEXT NOT NULL,
--     user_name TEXT NOT NULL,
--     action TEXT NOT NULL,
--     path TEXT NOT NULL,
--     http_method TEXT NOT NULL,
--     status_code INT NOT NULL,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX api_call_history_session_idx ON api_call_history(session_id);
-- CREATE INDEX api_call_history_created_idx ON api_call_history(created_at);

-- ALTER TABLE tasks
--     ADD COLUMN display_order INT NOT NULL DEFAULT 0;

-- UPDATE tasks t
-- SET display_order = seq.rn
-- FROM (
--     SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS rn
--     FROM tasks
-- ) AS seq
-- WHERE t.id = seq.id;
