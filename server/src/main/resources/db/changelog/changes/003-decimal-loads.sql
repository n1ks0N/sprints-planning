--liquibase formatted sql

--changeset sprints:003
ALTER TABLE task_allocations ALTER COLUMN days TYPE NUMERIC(10, 2) USING days::numeric;
ALTER TABLE task_allocations ALTER COLUMN days SET DEFAULT 0;
ALTER TABLE task_loads ALTER COLUMN days TYPE NUMERIC(10, 2) USING days::numeric;
ALTER TABLE task_loads ALTER COLUMN days SET DEFAULT 0;
