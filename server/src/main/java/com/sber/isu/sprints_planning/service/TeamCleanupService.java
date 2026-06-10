package com.sber.isu.sprints_planning.service;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TeamCleanupService {

    private final JdbcTemplate jdbcTemplate;

    private static final List<String> TEAM_TABLES = List.of(
        "planning_backlog_items",
        "jira_export_batches",
        "task_jira_issues",
        "task_allocations",
        "task_loads",
        "task_participants",
        "tasks",
        "task_customers",
        "task_streams",
        "participant_role_values",
        "participant_stream_values",
        "releases",
        "api_call_history",
        "participants",
        "sprints",
        "quarters"
    );

    public TeamCleanupService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void deleteTeamData(String teamKey) {
        for (String table : TEAM_TABLES) {
            jdbcTemplate.update("DELETE FROM " + table + " WHERE team_key = ?", teamKey);
        }
    }

    public long countTeamData(String teamKey) {
        long total = 0;
        for (String table : TEAM_TABLES) {
            total += jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE team_key = ?",
                Long.class,
                teamKey
            );
        }
        return total;
    }
}
