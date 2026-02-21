--liquibase formatted sql

--changeset sprints:1.0.0-11-task-history-enrichment

ALTER TABLE api_call_history
    ADD COLUMN IF NOT EXISTS entity_type TEXT;

ALTER TABLE api_call_history
    ADD COLUMN IF NOT EXISTS entity_id UUID;

ALTER TABLE api_call_history
    ADD COLUMN IF NOT EXISTS event_type TEXT;

ALTER TABLE api_call_history
    ADD COLUMN IF NOT EXISTS changes_json JSONB;

ALTER TABLE api_call_history
    ADD COLUMN IF NOT EXISTS meta_json JSONB;

CREATE INDEX IF NOT EXISTS api_call_history_task_idx
    ON api_call_history (team_key, entity_type, entity_id, created_at DESC);
