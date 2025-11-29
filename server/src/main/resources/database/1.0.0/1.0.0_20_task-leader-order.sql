--liquibase formatted sql

--changeset sprints:002
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS leader_participant_id UUID REFERENCES participants(id);
ALTER TABLE task_participants ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
