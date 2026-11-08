--liquibase formatted sql

--changeset sprints:1.0.0-23 runInTransaction:false
-- Each primary key already starts with task_id; these single-column indexes are redundant.
DROP INDEX CONCURRENTLY IF EXISTS "${database.defaultSchemaName}".idx_task_allocations_task;
DROP INDEX CONCURRENTLY IF EXISTS "${database.defaultSchemaName}".idx_task_loads_task;
DROP INDEX CONCURRENTLY IF EXISTS "${database.defaultSchemaName}".idx_task_participants_task;
--rollback CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_allocations_task ON "${database.defaultSchemaName}".task_allocations(task_id);
--rollback CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_loads_task ON "${database.defaultSchemaName}".task_loads(task_id);
--rollback CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_participants_task ON "${database.defaultSchemaName}".task_participants(task_id);
