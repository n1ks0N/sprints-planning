-- NOTE: replace target_sprint_id with required Jira sprint id before production rollout if needed.
WITH params AS (
    SELECT 236205::bigint AS target_sprint_id
)
UPDATE jira_export_batches b
SET jira_sprint_id = p.target_sprint_id
FROM params p;

WITH params AS (
    SELECT 236205::bigint AS target_sprint_id
)
UPDATE task_jira_issues i
SET jira_sprint_id = p.target_sprint_id
FROM params p;
