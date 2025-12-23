--liquibase formatted sql

--changeset sprints:1.0.0-6-perf-indexes
CREATE INDEX IF NOT EXISTS idx_tasks_team_order ON tasks(team_key, display_order, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_key);
CREATE INDEX IF NOT EXISTS idx_sprints_team_quarter ON sprints(team_key, quarter_id);
CREATE INDEX IF NOT EXISTS idx_quarters_team ON quarters(team_key);
CREATE INDEX IF NOT EXISTS idx_participants_team ON participants(team_key);
CREATE INDEX IF NOT EXISTS idx_task_participants_task ON task_participants(task_id);
CREATE INDEX IF NOT EXISTS idx_task_allocations_task ON task_allocations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_loads_task ON task_loads(task_id);
