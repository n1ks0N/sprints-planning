package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Answers;

class TeamCleanupServiceTest {
    private final List<String> statements = new ArrayList<>();
    private final List<String> teams = new ArrayList<>();
    private TeamCleanupService service;

    @BeforeEach
    void setUp() {
        EntityManager entityManager = mock(EntityManager.class);
        when(entityManager.createNativeQuery(anyString())).thenAnswer(invocation -> {
            statements.add(invocation.getArgument(0));
            Query query = mock(Query.class, Answers.RETURNS_SELF);
            when(query.setParameter(anyString(), org.mockito.ArgumentMatchers.any())).thenAnswer(parameter -> {
                assertThat((String) parameter.getArgument(0)).isEqualTo("teamKey");
                teams.add(parameter.getArgument(1));
                return query;
            });
            when(query.getSingleResult()).thenReturn(1L);
            return query;
        });
        service = new TeamCleanupService(entityManager);
    }

    @Test
    void deleteTeamDataIncludesPlanningAndReferenceTablesAndUsesMappedSchema() {
        service.deleteTeamData("team-a");
        assertThat(statements).anyMatch(sql -> sql.contains("planning_backlog_items"));
        assertThat(statements).anyMatch(sql -> sql.contains("participant_role_values"));
        assertThat(statements).anyMatch(sql -> sql.contains("participant_stream_values"));
        assertThat(statements).anyMatch(sql -> sql.contains("task_customers"));
        assertThat(statements).anyMatch(sql -> sql.contains("task_streams"));
        assertThat(statements).allSatisfy(sql -> assertThat(sql).startsWith("DELETE FROM {h-schema}").endsWith("WHERE team_key = :teamKey"));
        assertThat(teams).hasSize(statements.size()).containsOnly("team-a");
    }

    @Test
    void countTeamDataUsesTheSameSchemaAndScopeAsDeletion() {
        long total = service.countTeamData("team-a");
        assertThat(total).isEqualTo(statements.size());
        assertThat(statements).allSatisfy(sql -> assertThat(sql).startsWith("SELECT COUNT(*) FROM {h-schema}").endsWith("WHERE team_key = :teamKey"));
        assertThat(teams).hasSize(statements.size()).containsOnly("team-a");
    }
}
