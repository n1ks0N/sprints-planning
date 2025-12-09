--liquibase formatted sql

--changeset sprints:1.0.0-4
INSERT INTO teams (key, name)
VALUES ('customlab', 'Custom Lab')
ON CONFLICT (key) DO NOTHING;
