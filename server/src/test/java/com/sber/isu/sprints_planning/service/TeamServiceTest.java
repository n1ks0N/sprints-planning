package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class TeamServiceTest {

    private TeamRepository teamRepository;
    private RecordingTeamCleanupService teamCleanupService;
    private RecordingApiHistoryService apiHistoryService;
    private TeamService teamService;

    @BeforeEach
    void setUp() {
        teamRepository = mock(TeamRepository.class);
        teamCleanupService = new RecordingTeamCleanupService();
        apiHistoryService = new RecordingApiHistoryService();
        teamService = new TeamService(teamRepository, teamCleanupService, apiHistoryService);
    }

    @Test
    void deleteTeamWithDataCleanupMarksAndClearsHistoryDeletionScope() {
        when(teamRepository.existsById("team-a")).thenReturn(true);

        teamService.deleteTeam("team-a", true);

        assertThat(apiHistoryService.events).containsExactly("mark:team-a", "clear:team-a");
        assertThat(teamCleanupService.deletedTeams).containsExactly("team-a");
    }

    @Test
    void deleteTeamClearsHistoryDeletionScopeEvenWhenDeleteFails() {
        when(teamRepository.existsById("team-a")).thenReturn(true);
        doThrow(new DataIntegrityViolationException("fk")).when(teamRepository).deleteById("team-a");

        assertThatThrownBy(() -> teamService.deleteTeam("team-a", true))
            .isInstanceOf(ResponseStatusException.class);

        assertThat(apiHistoryService.events).containsExactly("mark:team-a", "clear:team-a");
    }

    private static final class RecordingTeamCleanupService extends TeamCleanupService {

        private final List<String> deletedTeams = new ArrayList<>();

        private RecordingTeamCleanupService() {
            super(new JdbcTemplate());
        }

        @Override
        public void deleteTeamData(String teamKey) {
            deletedTeams.add(teamKey);
        }
    }

    private static final class RecordingApiHistoryService extends ApiHistoryService {

        private final List<String> events = new ArrayList<>();

        private RecordingApiHistoryService() {
            super(
                mock(ApiCallHistoryRepository.class),
                new ApiActionDescriptionResolver(),
                mock(TeamRepository.class),
                Runnable::run
            );
        }

        @Override
        public void markTeamDeletionInProgress(String teamKey) {
            events.add("mark:" + teamKey);
        }

        @Override
        public void clearTeamDeletionInProgress(String teamKey) {
            events.add("clear:" + teamKey);
        }
    }
}
