--liquibase formatted sql

--changeset sprints:1.0.0-22
ALTER TABLE tasks
    ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ROADMAP',
    ADD COLUMN revision BIGINT NOT NULL DEFAULT 0;

UPDATE tasks
SET status = CASE status WHEN 'notdone' THEN 'canceled' WHEN 'partial' THEN 'done' ELSE status END,
    workspace = CASE WHEN status = 'backlog' THEN 'BACKLOG' ELSE 'ROADMAP' END
WHERE status IN ('notdone', 'partial', 'backlog');

ALTER TABLE tasks
    ADD CONSTRAINT tasks_workspace_check CHECK (
        (workspace = 'BACKLOG' AND status IN ('backlog','canceled')) OR
        (workspace = 'ROADMAP' AND status IN ('inprogress','done','canceled'))
    ),
    ADD CONSTRAINT tasks_id_team_unique UNIQUE(id, team_key);

CREATE INDEX tasks_workspace_order_idx ON tasks(team_key, workspace, display_order, created_at, id);

ALTER TABLE planning_backlog_items
    ADD COLUMN source_task_id UUID,
    ADD COLUMN source_revision BIGINT,
    ADD COLUMN source_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN source_leader_id UUID,
    ADD CONSTRAINT planning_source_fk FOREIGN KEY(source_task_id, team_key) REFERENCES tasks(id, team_key) ON DELETE CASCADE;

CREATE UNIQUE INDEX planning_source_unique ON planning_backlog_items(source_task_id) WHERE source_task_id IS NOT NULL;
-- Existing duplicate dates must be reconciled explicitly, preserving calendar stages and links.
CREATE UNIQUE INDEX releases_team_prom_unique ON releases(team_key, prom_date);
