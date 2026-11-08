package com.sber.isu.sprints_planning.service;

import java.util.List;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TeamCleanupService {

    private final EntityManager entityManager;

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

    public TeamCleanupService(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Transactional
    public void deleteTeamData(String teamKey) {
        for (String table : TEAM_TABLES) {
            entityManager.createNativeQuery("DELETE FROM {h-schema}" + table + " WHERE team_key = :teamKey")
                .setParameter("teamKey", teamKey).executeUpdate();
        }
    }

    @Transactional(readOnly = true)
    public long countTeamData(String teamKey) {
        long total = 0;
        for (String table : TEAM_TABLES) {
            total += ((Number) entityManager.createNativeQuery("SELECT COUNT(*) FROM {h-schema}" + table + " WHERE team_key = :teamKey")
                .setParameter("teamKey", teamKey).getSingleResult()).longValue();
        }
        return total;
    }
}
