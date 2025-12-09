--liquibase formatted sql

--changeset sprints:1.0.0-4
INSERT INTO teams (key, name) VALUES ('customlab', 'Custom Lab') ON CONFLICT (key) DO NOTHING;

UPDATE participants
SET team_key = 'customlab'
WHERE team_key IS NULL OR team_key = '';

UPDATE api_call_history
SET team_key = 'customlab'
WHERE team_key IS NULL OR team_key = '';

UPDATE participants SET team_key = lower(team_key);
UPDATE api_call_history SET team_key = lower(team_key);
