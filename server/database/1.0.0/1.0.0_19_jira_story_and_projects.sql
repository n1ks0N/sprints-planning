--liquibase formatted sql

--changeset sprints:1.0.0-19-jira-story-and-projects
--validCheckSum 9:f01ef2e2dc0d3f98006003fb8883a587
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS jira_board_id BIGINT;

ALTER TABLE task_jira_issues
    ALTER COLUMN participant_id DROP NOT NULL;

ALTER TABLE task_jira_issues
    ADD COLUMN IF NOT EXISTS issue_scope TEXT NOT NULL DEFAULT 'PARTICIPANT';

ALTER TABLE task_jira_issues
    ADD COLUMN IF NOT EXISTS parent_task_jira_issue_id UUID REFERENCES task_jira_issues(id) ON DELETE SET NULL;

UPDATE task_jira_issues issue
SET planning_sprint_id = (
    SELECT sprint.id
    FROM sprints sprint
    LEFT JOIN quarters quarter ON quarter.id = sprint.quarter_id
    ORDER BY
        CASE WHEN sprint.team_key = issue.team_key THEN 0 ELSE 1 END,
        quarter.start_date,
        sprint.start_date,
        sprint."order",
        sprint.id
    LIMIT 1
)
WHERE issue.issue_scope = 'PARTICIPANT'
  AND issue.planning_sprint_id IS NULL
  AND EXISTS (SELECT 1 FROM sprints);

ALTER TABLE task_jira_issues
    ADD CONSTRAINT task_jira_issues_scope_chk
        CHECK (issue_scope IN ('STORY', 'PARTICIPANT'));

ALTER TABLE task_jira_issues
    ADD CONSTRAINT task_jira_issues_scope_participant_chk
        CHECK (
            (issue_scope = 'STORY' AND participant_id IS NULL AND planning_sprint_id IS NULL)
            OR
            (issue_scope = 'PARTICIPANT' AND participant_id IS NOT NULL AND planning_sprint_id IS NOT NULL)
        );

DROP INDEX IF EXISTS ux_task_jira_issues_task_participant_sprint;
DROP INDEX IF EXISTS ux_task_jira_issues_story_sprint;
DROP INDEX IF EXISTS ux_task_jira_issues_story;

CREATE UNIQUE INDEX ux_task_jira_issues_story
    ON task_jira_issues (team_key, task_id)
    WHERE issue_scope = 'STORY';

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_jira_issues_participant_sprint
    ON task_jira_issues (team_key, task_id, participant_id, planning_sprint_id, jira_project_key)
    WHERE issue_scope = 'PARTICIPANT';

CREATE INDEX IF NOT EXISTS ix_task_jira_issues_parent
    ON task_jira_issues (parent_task_jira_issue_id);

CREATE INDEX IF NOT EXISTS ix_task_jira_issues_scope
    ON task_jira_issues (team_key, issue_scope, task_id);
