--liquibase formatted sql

--changeset sprints:1.0.0-3
CREATE TABLE teams (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

INSERT INTO teams (key, name) VALUES ('customlab', 'Custom Lab') ON CONFLICT (key) DO NOTHING;

DROP TABLE IF EXISTS run_vacation;

ALTER TABLE quarters ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE sprints ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE participants ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE tasks ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_participants ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_loads ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_allocations ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE releases ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE api_call_history ADD COLUMN team_key TEXT REFERENCES teams(key);

ALTER TABLE quarters DROP CONSTRAINT IF EXISTS quarters_name_key;
ALTER TABLE quarters ADD CONSTRAINT quarters_team_name_key UNIQUE (team_key, name);
