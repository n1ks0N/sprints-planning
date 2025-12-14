--liquibase formatted sql

--changeset sprints:1.0.0-5
CREATE TABLE participant_user_streams (
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    user_stream TEXT NOT NULL,
    PRIMARY KEY (participant_id, user_stream)
);
CREATE INDEX participant_user_stream_stream_idx ON participant_user_streams(user_stream);
