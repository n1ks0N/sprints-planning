--liquibase formatted sql

--changeset sprints:1.0.0-15
DROP INDEX IF EXISTS ux_task_jira_issues_task_participant;

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_jira_issues_task_participant_sprint
    ON task_jira_issues (team_key, task_id, participant_id, planning_sprint_id);

CREATE TABLE IF NOT EXISTS jira_export_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_key TEXT NOT NULL REFERENCES teams(key),
    session_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    planning_sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
    jira_sprint_id BIGINT NOT NULL,
    project_key TEXT NOT NULL,
    labels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL,
    total_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_jira_export_batches_team_created
    ON jira_export_batches (team_key, created_at DESC);

ALTER TABLE task_jira_issues
    ADD COLUMN IF NOT EXISTS export_batch_id UUID REFERENCES jira_export_batches(id) ON DELETE SET NULL;

ALTER TABLE task_jira_issues
    ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE task_jira_issues
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE task_jira_issues
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_task_jira_issues_export_batch
    ON task_jira_issues (export_batch_id);
