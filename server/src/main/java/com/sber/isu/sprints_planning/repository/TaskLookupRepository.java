package com.sber.isu.sprints_planning.repository;

import java.util.Collection;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TaskLookupRepository {

    private final JdbcTemplate jdbcTemplate;

    public TaskLookupRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void ensureCustomers(String teamKey, Collection<String> customers) {
        upsertValues("task_customers", teamKey, customers);
    }

    public void ensureStreams(String teamKey, Collection<String> streams) {
        upsertValues("task_streams", teamKey, streams);
    }

    public List<String> findCustomers(String teamKey) {
        return jdbcTemplate.queryForList(
            "SELECT name FROM task_customers WHERE team_key = ? ORDER BY name",
            String.class,
            teamKey
        );
    }

    public List<String> findStreams(String teamKey) {
        return jdbcTemplate.queryForList(
            "SELECT name FROM task_streams WHERE team_key = ? ORDER BY name",
            String.class,
            teamKey
        );
    }

    private void upsertValues(String table, String teamKey, Collection<String> values) {
        if (values == null || values.isEmpty()) {
            return;
        }
        String sql = "INSERT INTO " + table + " (team_key, name) VALUES (?, ?) ON CONFLICT DO NOTHING";
        List<Object[]> batch = values.stream()
            .map(value -> new Object[] { teamKey, value })
            .toList();
        jdbcTemplate.batchUpdate(sql, batch);
    }
}
