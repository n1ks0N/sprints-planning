--liquibase formatted sql

--changeset sprints:1.0.0-10-task-streams-customers

-- Reference tables for unique task streams and customers
CREATE TABLE task_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (name, team_key)
);
CREATE INDEX task_streams_team_key_idx ON task_streams(team_key);
CREATE INDEX task_streams_name_idx ON task_streams(name);

CREATE TABLE task_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    team_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (name, team_key)
);
CREATE INDEX task_customers_team_key_idx ON task_customers(team_key);
CREATE INDEX task_customers_name_idx ON task_customers(name);

-- Junction tables for many-to-many relationships
CREATE TABLE task_stream_values (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    stream_id UUID NOT NULL REFERENCES task_streams(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, stream_id)
);
CREATE INDEX task_stream_values_stream_idx ON task_stream_values(stream_id);

CREATE TABLE task_customer_values (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES task_customers(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, customer_id)
);
CREATE INDEX task_customer_values_customer_idx ON task_customer_values(customer_id);

-- Migrate existing data: populate reference tables with unique values
INSERT INTO task_streams (name, team_key)
SELECT DISTINCT stream, team_key
FROM tasks
WHERE stream IS NOT NULL AND stream <> '';

INSERT INTO task_customers (name, team_key)
SELECT DISTINCT customer, team_key
FROM tasks
WHERE customer IS NOT NULL AND customer <> '';

-- Migrate existing data: populate junction tables
INSERT INTO task_stream_values (task_id, stream_id)
SELECT t.id, ts.id
FROM tasks t
JOIN task_streams ts ON ts.name = t.stream AND ts.team_key = t.team_key
WHERE t.stream IS NOT NULL AND t.stream <> '';

INSERT INTO task_customer_values (task_id, customer_id)
SELECT t.id, tc.id
FROM tasks t
JOIN task_customers tc ON tc.name = t.customer AND tc.team_key = t.team_key
WHERE t.customer IS NOT NULL AND t.customer <> '';

-- Note: We keep the original stream and customer columns for backward compatibility
-- They can be removed in a future migration after full verification
