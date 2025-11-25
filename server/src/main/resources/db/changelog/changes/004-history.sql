--liquibase formatted sql

--changeset sprints:004
CREATE TABLE history_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name VARCHAR(255) NOT NULL,
    description TEXT,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    rolled_back_at TIMESTAMPTZ
);

CREATE TABLE history_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES history_groups(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    undo JSONB
);

CREATE INDEX idx_history_groups_created_at ON history_groups(created_at DESC);
CREATE INDEX idx_history_changes_group ON history_changes(group_id);
