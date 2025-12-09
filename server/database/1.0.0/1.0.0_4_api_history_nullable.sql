--liquibase formatted sql

--changeset sprints:1.0.0-4
ALTER TABLE api_call_history ALTER COLUMN team_key DROP NOT NULL;
ALTER TABLE api_call_history ALTER COLUMN team_key DROP DEFAULT;
