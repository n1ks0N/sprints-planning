--liquibase formatted sql

--changeset sprints:1.0.0-3
CREATE TABLE teams (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

INSERT INTO teams (key, name) VALUES ('customlab', 'Custom Lab') ON CONFLICT (key) DO NOTHING;

ALTER TABLE quarters ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE sprints ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE participants ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE run_vacation ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE tasks ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_participants ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_loads ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE task_allocations ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE releases ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);
ALTER TABLE api_call_history ADD COLUMN team_key TEXT NOT NULL DEFAULT 'customlab' REFERENCES teams(key);

-- ensure all existing data is tied to the default team and keys are lowercase
UPDATE participants SET team_key = 'customlab' WHERE team_key IS NULL OR team_key = '';
UPDATE api_call_history SET team_key = 'customlab' WHERE team_key IS NULL OR team_key = '';

UPDATE participants SET team_key = lower(team_key);
UPDATE api_call_history SET team_key = lower(team_key);

ALTER TABLE quarters DROP CONSTRAINT IF EXISTS quarters_name_key;
ALTER TABLE quarters ADD CONSTRAINT quarters_team_name_key UNIQUE (team_key, name);
