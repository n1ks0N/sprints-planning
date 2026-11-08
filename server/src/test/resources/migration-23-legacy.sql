--liquibase formatted sql

--changeset sprints:1.0.0-23-alloc-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
DROP INDEX CONCURRENTLY IF EXISTS idx_task_allocations_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_allocations_task ON task_allocations(task_id);

--changeset sprints:1.0.0-23-load-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
DROP INDEX CONCURRENTLY IF EXISTS idx_task_loads_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_loads_task ON task_loads(task_id);

--changeset sprints:1.0.0-23-participant-task-index runInTransaction:false logicalFilePath:database/1.0.0/1.0.0_23_redundant_task_indexes.sql
DROP INDEX CONCURRENTLY IF EXISTS idx_task_participants_task;
--rollback CREATE INDEX CONCURRENTLY idx_task_participants_task ON task_participants(task_id);
