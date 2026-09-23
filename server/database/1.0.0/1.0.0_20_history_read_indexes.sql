--liquibase formatted sql

--changeset sprints:1.0.0-20-history-read-indexes
CREATE INDEX IF NOT EXISTS api_call_history_actions_summary_idx
    ON api_call_history(team_key, created_at DESC, session_id, user_name)
    WHERE http_method <> 'GET' AND (entity_type IS NULL OR entity_type = '');

CREATE INDEX IF NOT EXISTS api_call_history_actions_session_idx
    ON api_call_history(team_key, session_id, user_name, created_at DESC)
    WHERE http_method <> 'GET' AND (entity_type IS NULL OR entity_type = '');
