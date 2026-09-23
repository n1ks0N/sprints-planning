package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.request.TaskParticipantAddRequest;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationBulkWriter;
import com.sber.isu.sprints_planning.repository.TaskCustomerRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadValueProjection;
import com.sber.isu.sprints_planning.repository.TaskParticipantRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaskServiceParticipantTest {

    private static final String TEAM_KEY = "team-a";
    private static final UUID TASK_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID EXISTING_PARTICIPANT_ID =
        UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID PARTICIPANT_ID =
        UUID.fromString("33333333-3333-3333-3333-333333333333");

    @Mock private TaskRepository taskRepository;
    @Mock private TaskParticipantRepository taskParticipantRepository;
    @Mock private TaskLoadRepository taskLoadRepository;
    @Mock private TaskAllocationRepository taskAllocationRepository;
    @Mock private TaskAllocationBulkWriter taskAllocationBulkWriter;
    @Mock private ParticipantRepository participantRepository;
    @Mock private SprintRepository sprintRepository;
    @Mock private QuarterRepository quarterRepository;
    @Mock private ReleaseRepository releaseRepository;
    @Mock private TaskStreamRepository taskStreamRepository;
    @Mock private TaskCustomerRepository taskCustomerRepository;
    @Mock private TaskJiraIssueRepository taskJiraIssueRepository;
    @Mock private ApiCallHistoryRepository apiCallHistoryRepository;
    @Mock private TeamRepository teamRepository;

    private TaskService taskService;

    @BeforeEach
    void setUp() {
        taskService = new TaskService(
            taskRepository,
            taskParticipantRepository,
            taskLoadRepository,
            taskAllocationRepository,
            taskAllocationBulkWriter,
            participantRepository,
            sprintRepository,
            quarterRepository,
            releaseRepository,
            taskStreamRepository,
            taskCustomerRepository,
            taskJiraIssueRepository,
            new ApiHistoryService(
                apiCallHistoryRepository,
                new ApiActionDescriptionResolver(),
                teamRepository,
                Runnable::run
            )
        );
    }

    @Test
    void addParticipantUsesOnlyLightweightQueriesAndReturnsCanonicalOrder() {
        TaskEntity task = task();
        when(taskRepository.findByIdAndTeamKeyForUpdate(TASK_ID, TEAM_KEY)).thenReturn(Optional.of(task));
        when(taskParticipantRepository.insertIfAbsent(TASK_ID, PARTICIPANT_ID, TEAM_KEY)).thenReturn(1);
        when(taskParticipantRepository.findParticipantIds(TASK_ID, TEAM_KEY))
            .thenReturn(List.of(EXISTING_PARTICIPANT_ID, PARTICIPANT_ID));

        var result = taskService.addParticipant(
            TEAM_KEY,
            TASK_ID,
            new TaskParticipantAddRequest(PARTICIPANT_ID.toString())
        );

        assertThat(result.taskId()).isEqualTo(TASK_ID.toString());
        assertThat(result.participantIds()).containsExactly(
            EXISTING_PARTICIPANT_ID.toString(),
            PARTICIPANT_ID.toString()
        );
        assertThat(result.added()).isTrue();
        assertThat(result.updatedAt()).isEqualTo(LocalDate.now());
        assertThat(task.getUpdatedAt()).isEqualTo(LocalDate.now());
        verifyNoHeavyTaskGraphQueries();
    }

    @Test
    void addParticipantIsIdempotent() {
        TaskEntity task = task();
        LocalDate originalUpdatedAt = task.getUpdatedAt();
        when(taskRepository.findByIdAndTeamKeyForUpdate(TASK_ID, TEAM_KEY)).thenReturn(Optional.of(task));
        when(taskParticipantRepository.insertIfAbsent(TASK_ID, PARTICIPANT_ID, TEAM_KEY)).thenReturn(0);
        when(taskParticipantRepository.findParticipantIds(TASK_ID, TEAM_KEY))
            .thenReturn(List.of(EXISTING_PARTICIPANT_ID, PARTICIPANT_ID));

        var result = taskService.addParticipant(
            TEAM_KEY,
            TASK_ID,
            new TaskParticipantAddRequest(PARTICIPANT_ID.toString())
        );

        assertThat(result.added()).isFalse();
        assertThat(result.participantIds()).containsExactly(
            EXISTING_PARTICIPANT_ID.toString(),
            PARTICIPANT_ID.toString()
        );
        assertThat(task.getUpdatedAt()).isEqualTo(originalUpdatedAt);
        assertThat(result.updatedAt()).isEqualTo(originalUpdatedAt);
        verifyNoHeavyTaskGraphQueries();
    }

    @Test
    void addParticipantRejectsParticipantFromAnotherTeamOrMissingParticipant() {
        when(taskRepository.findByIdAndTeamKeyForUpdate(TASK_ID, TEAM_KEY)).thenReturn(Optional.of(task()));
        when(taskParticipantRepository.insertIfAbsent(TASK_ID, PARTICIPANT_ID, TEAM_KEY)).thenReturn(0);
        when(taskParticipantRepository.findParticipantIds(TASK_ID, TEAM_KEY))
            .thenReturn(List.of(EXISTING_PARTICIPANT_ID));

        assertThatThrownBy(() -> taskService.addParticipant(
            TEAM_KEY,
            TASK_ID,
            new TaskParticipantAddRequest(PARTICIPANT_ID.toString())
        )).isInstanceOf(EntityNotFoundException.class)
            .hasMessage("Participant not found");

        verifyNoHeavyTaskGraphQueries();
    }

    @Test
    void removeParticipantCleansDependenciesAndReturnsOnlyAffectedLoads() {
        UUID firstSprintId = UUID.fromString("44444444-4444-4444-4444-444444444444");
        UUID secondSprintId = UUID.fromString("55555555-5555-5555-5555-555555555555");
        TaskEntity task = task();
        ParticipantEntity leader = new ParticipantEntity();
        leader.setId(PARTICIPANT_ID);
        task.setLeaderParticipant(leader);
        when(taskRepository.findByIdAndTeamKeyForUpdate(TASK_ID, TEAM_KEY)).thenReturn(Optional.of(task));
        when(taskParticipantRepository.findParticipantIds(TASK_ID, TEAM_KEY))
            .thenReturn(List.of(EXISTING_PARTICIPANT_ID, PARTICIPANT_ID));
        when(taskAllocationRepository.findSprintIdsForParticipant(TASK_ID, PARTICIPANT_ID, TEAM_KEY))
            .thenReturn(List.of(firstSprintId, secondSprintId));
        when(taskLoadRepository.findValuesForSprints(
            TASK_ID,
            TEAM_KEY,
            List.of(firstSprintId, secondSprintId)
        )).thenReturn(List.of(loadValue(firstSprintId, "2.5")));

        var result = taskService.removeParticipant(TEAM_KEY, TASK_ID, PARTICIPANT_ID);

        assertThat(result.removed()).isTrue();
        assertThat(result.participantIds()).containsExactly(EXISTING_PARTICIPANT_ID.toString());
        assertThat(result.affectedSprintIds()).containsExactly(
            firstSprintId.toString(),
            secondSprintId.toString()
        );
        assertThat(result.loads()).containsExactlyEntriesOf(
            java.util.Map.of(firstSprintId.toString(), new BigDecimal("2.5"))
        );
        assertThat(result.leaderId()).isNull();
        assertThat(result.updatedAt()).isEqualTo(LocalDate.now());
        assertThat(task.getLeaderParticipant()).isNull();
        assertThat(task.getUpdatedAt()).isEqualTo(LocalDate.now());
        verify(taskJiraIssueRepository).deleteForParticipant(TEAM_KEY, TASK_ID, PARTICIPANT_ID);
        verify(taskAllocationRepository).deleteForParticipant(TASK_ID, PARTICIPANT_ID, TEAM_KEY);
        verify(taskParticipantRepository).deleteForParticipant(TASK_ID, PARTICIPANT_ID, TEAM_KEY);
        verify(taskAllocationBulkWriter).rebuildLoads(
            TASK_ID,
            TEAM_KEY,
            List.of(firstSprintId, secondSprintId)
        );
        verify(taskRepository, never()).findWithDetailsById(any(), any());
        verifyNoInteractions(
            participantRepository,
            sprintRepository,
            quarterRepository,
            releaseRepository,
            taskStreamRepository,
            taskCustomerRepository,
            apiCallHistoryRepository,
            teamRepository
        );
    }

    @Test
    void removeParticipantIsIdempotentWhenLinkDoesNotExist() {
        TaskEntity task = task();
        LocalDate originalUpdatedAt = task.getUpdatedAt();
        when(taskRepository.findByIdAndTeamKeyForUpdate(TASK_ID, TEAM_KEY)).thenReturn(Optional.of(task));
        when(taskParticipantRepository.findParticipantIds(TASK_ID, TEAM_KEY))
            .thenReturn(List.of(EXISTING_PARTICIPANT_ID));

        var result = taskService.removeParticipant(TEAM_KEY, TASK_ID, PARTICIPANT_ID);

        assertThat(result.removed()).isFalse();
        assertThat(result.participantIds()).containsExactly(EXISTING_PARTICIPANT_ID.toString());
        assertThat(result.affectedSprintIds()).isEmpty();
        assertThat(result.loads()).isEmpty();
        assertThat(result.updatedAt()).isEqualTo(originalUpdatedAt);
        assertThat(task.getUpdatedAt()).isEqualTo(originalUpdatedAt);
        verify(taskParticipantRepository, never()).deleteForParticipant(any(), any(), any());
        verifyNoInteractions(taskAllocationRepository, taskLoadRepository, taskJiraIssueRepository);
        verify(taskRepository, never()).findWithDetailsById(any(), any());
    }

    private TaskEntity task() {
        TaskEntity task = new TaskEntity();
        task.setId(TASK_ID);
        task.setTeamKey(TEAM_KEY);
        task.setUpdatedAt(LocalDate.of(2026, 1, 1));
        return task;
    }

    private TaskLoadValueProjection loadValue(UUID sprintId, String days) {
        return new TaskLoadValueProjection() {
            @Override
            public UUID getSprintId() {
                return sprintId;
            }

            @Override
            public BigDecimal getDays() {
                return new BigDecimal(days);
            }
        };
    }

    private void verifyNoHeavyTaskGraphQueries() {
        verify(taskRepository, never()).findWithDetailsById(any(), any());
        verifyNoInteractions(
            taskLoadRepository,
            taskAllocationRepository,
            participantRepository,
            sprintRepository,
            quarterRepository,
            releaseRepository,
            taskStreamRepository,
            taskCustomerRepository,
            taskJiraIssueRepository,
            apiCallHistoryRepository,
            teamRepository
        );
    }
}
