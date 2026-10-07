--liquibase formatted sql

--changeset sprints:1.0.0-21
ALTER TABLE participants ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
