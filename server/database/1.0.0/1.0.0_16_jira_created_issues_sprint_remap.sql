--liquibase formatted sql

--changeset sprints:1.0.0-16
-- Optional one-time remap for already created Jira issues.
-- Set target_sprint_id to required Jira sprint id before rollout.
WITH params AS (
    SELECT NULL::bigint AS target_sprint_id
)
UPDATE task_jira_issues i
SET jira_sprint_id = p.target_sprint_id,
    updated_at = now()
FROM params p
WHERE p.target_sprint_id IS NOT NULL
  AND i.status = 'CREATED';
