--liquibase formatted sql

--changeset sprints:1.0.0-4
--validCheckSum: 9:acbf238f91b7ba2e42090ab4287dd302
INSERT INTO teams (key, name)
VALUES ('customlab', 'Custom Lab')
ON CONFLICT (key) DO NOTHING;
