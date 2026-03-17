--liquibase formatted sql

--changeset sprints:1.0.0-15
DROP INDEX IF EXISTS ux_task_jira_issues_task_participant;

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_jira_issues_task_participant_sprint
    ON task_jira_issues (team_key, task_id, participant_id, planning_sprint_id);
