package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TeamCleanupServiceTest {

    private RecordingJdbcTemplate jdbcTemplate;
    private TeamCleanupService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = new RecordingJdbcTemplate();
        service = new TeamCleanupService(jdbcTemplate);
    }

    @Test
    void deleteTeamDataIncludesPlanningAndReferenceTables() {
        service.deleteTeamData("team-a");

        assertThat(jdbcTemplate.updateSql).anyMatch(sql -> sql.contains("planning_backlog_items"));
        assertThat(jdbcTemplate.updateSql).anyMatch(sql -> sql.contains("participant_role_values"));
        assertThat(jdbcTemplate.updateSql).anyMatch(sql -> sql.contains("participant_stream_values"));
        assertThat(jdbcTemplate.updateSql).anyMatch(sql -> sql.contains("task_customers"));
        assertThat(jdbcTemplate.updateSql).anyMatch(sql -> sql.contains("task_streams"));
    }

    @Test
    void countTeamDataAccountsForPlanningAndReferenceTables() {
        long total = service.countTeamData("team-a");

        assertThat(jdbcTemplate.countSql).anyMatch(sql -> sql.contains("planning_backlog_items"));
        assertThat(jdbcTemplate.countSql).anyMatch(sql -> sql.contains("participant_role_values"));
        assertThat(jdbcTemplate.countSql).anyMatch(sql -> sql.contains("participant_stream_values"));
        assertThat(total).isEqualTo(jdbcTemplate.countSql.size());
    }

    private static final class RecordingJdbcTemplate extends JdbcTemplate {

        private final List<String> updateSql = new ArrayList<>();
        private final List<String> countSql = new ArrayList<>();

        @Override
        public int update(String sql, Object... args) {
            updateSql.add(sql);
            return 1;
        }

        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
            countSql.add(sql);
            if (Long.class.equals(requiredType)) {
                return requiredType.cast(Long.valueOf(1));
            }
            return null;
        }
    }
}
