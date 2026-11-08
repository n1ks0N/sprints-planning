--liquibase formatted sql

--changeset sprints:1.0.0-22
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:0 SELECT count(*) FROM tasks WHERE status NOT IN ('inprogress','done','canceled','backlog','notdone','partial');
--precondition-sql-check expectedResult:0 SELECT count(*) FROM (SELECT 1 FROM releases GROUP BY team_key, prom_date HAVING count(*) > 1) duplicate_release_dates;
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

--changeset sprints:1.0.0-23-alloc-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:1 SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0] WHERE i.indrelid = 'task_allocations'::regclass AND i.indisprimary AND i.indisvalid AND a.attname = 'task_id';
--precondition-sql-check expectedResult:1 SELECT CASE WHEN to_regclass('idx_task_allocations_task') IS NULL THEN 1 ELSE (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am m ON m.oid=c.relam JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indexrelid=to_regclass('idx_task_allocations_task') AND i.indrelid='task_allocations'::regclass AND NOT i.indisunique AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL AND m.amname='btree' AND a.attname='task_id') END;
DROP INDEX CONCURRENTLY IF EXISTS idx_task_allocations_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_allocations_task ON task_allocations(task_id);

--changeset sprints:1.0.0-23-load-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:1 SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0] WHERE i.indrelid = 'task_loads'::regclass AND i.indisprimary AND i.indisvalid AND a.attname = 'task_id';
--precondition-sql-check expectedResult:1 SELECT CASE WHEN to_regclass('idx_task_loads_task') IS NULL THEN 1 ELSE (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am m ON m.oid=c.relam JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indexrelid=to_regclass('idx_task_loads_task') AND i.indrelid='task_loads'::regclass AND NOT i.indisunique AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL AND m.amname='btree' AND a.attname='task_id') END;
DROP INDEX CONCURRENTLY IF EXISTS idx_task_loads_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_loads_task ON task_loads(task_id);

--changeset sprints:1.0.0-23-participant-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
--preconditions onFail:HALT onError:HALT
--precondition-sql-check expectedResult:1 SELECT count(*) FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0] WHERE i.indrelid = 'task_participants'::regclass AND i.indisprimary AND i.indisvalid AND a.attname = 'task_id';
--precondition-sql-check expectedResult:1 SELECT CASE WHEN to_regclass('idx_task_participants_task') IS NULL THEN 1 ELSE (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am m ON m.oid=c.relam JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indexrelid=to_regclass('idx_task_participants_task') AND i.indrelid='task_participants'::regclass AND NOT i.indisunique AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL AND m.amname='btree' AND a.attname='task_id') END;
DROP INDEX CONCURRENTLY IF EXISTS idx_task_participants_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_participants_task ON task_participants(task_id);
