--liquibase formatted sql

--changeset sprints:1.0.0-18-planning-workbench
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS planning_quarter_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS planning_sprint_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS participant_role_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (name, team_key)
);

CREATE INDEX IF NOT EXISTS participant_role_values_team_key_idx ON participant_role_values(team_key);
CREATE INDEX IF NOT EXISTS participant_role_values_name_idx ON participant_role_values(name);

CREATE TABLE IF NOT EXISTS participant_stream_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (name, team_key)
);

CREATE INDEX IF NOT EXISTS participant_stream_values_team_key_idx ON participant_stream_values(team_key);
CREATE INDEX IF NOT EXISTS participant_stream_values_name_idx ON participant_stream_values(name);

INSERT INTO participant_role_values (name, team_key)
SELECT DISTINCT role, team_key
FROM participants
WHERE role IS NOT NULL AND role <> ''
ON CONFLICT DO NOTHING;

INSERT INTO participant_stream_values (name, team_key)
SELECT DISTINCT pus.user_stream, p.team_key
FROM participant_user_streams pus
JOIN participants p ON p.id = pus.participant_id
WHERE pus.user_stream IS NOT NULL AND pus.user_stream <> ''
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS planning_backlog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    dod TEXT NOT NULL DEFAULT '',
    priority SMALLINT NOT NULL DEFAULT 1,
    customers JSONB NOT NULL DEFAULT '[]'::jsonb,
    streams JSONB NOT NULL DEFAULT '[]'::jsonb,
    planning_demands JSONB NOT NULL DEFAULT '[]'::jsonb,
    planning_quarter_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    planning_sprint_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    release_date_id UUID NULL REFERENCES releases(id),
    initial_quarter_id UUID NULL REFERENCES quarters(id),
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS planning_backlog_items_team_key_idx ON planning_backlog_items(team_key);
CREATE INDEX IF NOT EXISTS planning_backlog_items_team_order_idx ON planning_backlog_items(team_key, display_order);
CREATE INDEX IF NOT EXISTS planning_backlog_items_release_date_idx ON planning_backlog_items(release_date_id);
CREATE INDEX IF NOT EXISTS planning_backlog_items_initial_quarter_idx ON planning_backlog_items(initial_quarter_id);

CREATE INDEX IF NOT EXISTS api_call_history_team_created_idx
    ON api_call_history(team_key, created_at DESC);

CREATE INDEX IF NOT EXISTS api_call_history_team_session_user_created_idx
    ON api_call_history(team_key, session_id, user_name, created_at DESC);

ALTER TABLE api_call_history
    DROP CONSTRAINT IF EXISTS api_call_history_team_key_fkey;

ALTER TABLE api_call_history
    ADD CONSTRAINT api_call_history_team_key_fkey
        FOREIGN KEY (team_key) REFERENCES teams(key) ON DELETE CASCADE;
