--liquibase formatted sql

--changeset sprints:1.0.0-14
ALTER TABLE participants
    ADD COLUMN IF NOT EXISTS jira_login TEXT;

CREATE TABLE IF NOT EXISTS task_jira_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_key TEXT NOT NULL REFERENCES teams(key),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    planning_sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
    jira_issue_id TEXT NOT NULL,
    jira_issue_key TEXT NOT NULL,
    jira_issue_url TEXT NOT NULL,
    jira_project_key TEXT NOT NULL,
    jira_sprint_id BIGINT,
    story_points NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'CREATED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_jira_issues_task_participant
    ON task_jira_issues (team_key, task_id, participant_id);

CREATE INDEX IF NOT EXISTS ix_task_jira_issues_task
    ON task_jira_issues (team_key, task_id);

CREATE INDEX IF NOT EXISTS ix_task_jira_issues_participant
    ON task_jira_issues (team_key, participant_id);
