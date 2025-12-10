--liquibase formatted sql

--changeset sprints:1.0.0-4
ALTER TABLE tasks
    ADD COLUMN status TEXT NOT NULL DEFAULT 'inprogress';
