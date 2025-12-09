--liquibase formatted sql

--changeset sprints:1.0.0-5
INSERT INTO teams (key, name)
VALUES ('customlab', 'Custom Lab')
ON CONFLICT (key) DO NOTHING;

INSERT INTO teams (key, name)
SELECT lower(key), name
FROM teams
WHERE key <> lower(key)
ON CONFLICT (key) DO NOTHING;

UPDATE quarters SET team_key = lower(team_key);
UPDATE sprints SET team_key = lower(team_key);
UPDATE participants SET team_key = lower(team_key);
UPDATE run_vacation SET team_key = lower(team_key);
UPDATE tasks SET team_key = lower(team_key);
UPDATE task_participants SET team_key = lower(team_key);
UPDATE task_loads SET team_key = lower(team_key);
UPDATE task_allocations SET team_key = lower(team_key);
UPDATE releases SET team_key = lower(team_key);
UPDATE api_call_history SET team_key = lower(team_key);

DELETE FROM teams WHERE key <> lower(key);
