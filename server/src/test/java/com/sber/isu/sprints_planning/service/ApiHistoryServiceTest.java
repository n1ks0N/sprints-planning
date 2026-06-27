package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.ApiHistorySessionSummaryProjection;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

class ApiHistoryServiceTest {

    private ApiCallHistoryRepository historyRepository;
    private ApiActionDescriptionResolver actionDescriptionResolver;
    private TeamRepository teamRepository;
    private ApiHistoryService service;

    @BeforeEach
    void setUp() {
        historyRepository = Mockito.mock(ApiCallHistoryRepository.class);
        actionDescriptionResolver = new ApiActionDescriptionResolver();
        teamRepository = Mockito.mock(TeamRepository.class);
        Executor directExecutor = Runnable::run;
        service = new ApiHistoryService(
            historyRepository,
            actionDescriptionResolver,
            teamRepository,
            directExecutor
        );
        when(historyRepository.save(any(ApiCallHistoryEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void persistsTeamScopedHistoryWhenTeamExists() {
        when(teamRepository.existsById("team-a")).thenReturn(true);

        service.logAsync("POST", "/api/v1/sprints-planning/team-a/tasks", "/api/v1/sprints-planning", "session-1", "user", 200);

        ArgumentCaptor<ApiCallHistoryEntity> captor = ArgumentCaptor.forClass(ApiCallHistoryEntity.class);
        verify(historyRepository).save(captor.capture());
        assertThat(captor.getValue().getTeamKey()).isEqualTo("team-a");
        assertThat(captor.getValue().getPath()).isEqualTo("/team-a/tasks");
    }

    @Test
    void skipsTeamScopedHistoryWhileDeletionIsInProgress() {
        when(teamRepository.existsById("team-a")).thenReturn(true);
        service.markTeamDeletionInProgress("team-a");

        service.logAsync("POST", "/api/v1/sprints-planning/team-a/tasks", "/api/v1/sprints-planning", "session-1", "user", 200);

        verify(historyRepository, never()).save(any(ApiCallHistoryEntity.class));
    }

    @Test
    void persistsWithoutTeamKeyWhenTeamAlreadyDoesNotExist() {
        when(teamRepository.existsById(eq("team-a"))).thenReturn(false);

        service.logAsync("POST", "/api/v1/sprints-planning/team-a/tasks", "/api/v1/sprints-planning", "session-1", "user", 200);

        ArgumentCaptor<ApiCallHistoryEntity> captor = ArgumentCaptor.forClass(ApiCallHistoryEntity.class);
        verify(historyRepository).save(captor.capture());
        assertThat(captor.getValue().getTeamKey()).isNull();
    }

    @Test
    void swallowsExecutorRejectionForAuxiliaryHistoryLogging() {
        service = new ApiHistoryService(
            historyRepository,
            actionDescriptionResolver,
            teamRepository,
            command -> {
                throw new RejectedExecutionException("queue is full");
            }
        );

        service.logAsync("POST", "/api/v1/sprints-planning/team-a/tasks", "/api/v1/sprints-planning", "session-1", "user", 200);

        verify(historyRepository, never()).save(any(ApiCallHistoryEntity.class));
    }

    @Test
    void readsActionHistoryGroupedBySession() {
        OffsetDateTime latestAt = OffsetDateTime.parse("2026-01-02T10:15:30Z");
        Instant latestInstant = latestAt.toInstant();
        ApiHistorySessionSummaryProjection summary = Mockito.mock(ApiHistorySessionSummaryProjection.class);
        when(summary.getSessionId()).thenReturn("session-1");
        when(summary.getUserName()).thenReturn("user");
        when(summary.getLatestCreatedAt()).thenReturn(latestInstant);

        ApiCallHistoryEntity action = new ApiCallHistoryEntity();
        UUID actionId = UUID.randomUUID();
        action.setId(actionId);
        action.setSessionId("session-1");
        action.setUserName("user");
        action.setAction("Создание задачи");
        action.setPath("/team-a/tasks");
        action.setHttpMethod("POST");
        action.setStatusCode(200);
        action.setCreatedAt(latestAt);
        action.setTeamKey("team-a");

        when(historyRepository.findActionSessionSummaries(eq("team-a"), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(summary)));
        when(historyRepository.findActionHistoryByTeamKeyAndSessionIds(eq("team-a"), eq(List.of("session-1"))))
            .thenReturn(List.of(action));

        var result = service.getHistory("team-a", 0, 10);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).sessionId()).isEqualTo("session-1");
        assertThat(result.get(0).lastActionAt()).isEqualTo(latestAt);
        assertThat(result.get(0).actions()).hasSize(1);
        assertThat(result.get(0).actions().get(0).id()).isEqualTo(actionId);
    }
}
