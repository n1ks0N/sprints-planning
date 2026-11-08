package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.ParticipantWorkloadRowDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationChangeRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationsSetRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskJiraLinksUpdateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskParticipantJiraLinkUpdateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.TaskCustomerRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadValueProjection;
import com.sber.isu.sprints_planning.repository.TaskParticipantRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import com.sber.isu.sprints_planning.repository.ParticipantWorkloadTaskFlatRow;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class TaskServiceAllocationTest {

    @Mock
    private TaskRepository taskRepository;
    @Mock
    private TaskParticipantRepository taskParticipantRepository;
    @Mock
    private TaskLoadRepository taskLoadRepository;
    @Mock
    private TaskAllocationRepository taskAllocationRepository;
    @Mock
    private EntityManager entityManager;
    @Mock
    private ParticipantRepository participantRepository;
    @Mock
    private SprintRepository sprintRepository;
    @Mock
    private QuarterRepository quarterRepository;
    @Mock
    private ReleaseRepository releaseRepository;
    @Mock
    private TaskStreamRepository taskStreamRepository;
    @Mock
    private TaskCustomerRepository taskCustomerRepository;
    @Mock
    private TaskJiraIssueRepository taskJiraIssueRepository;
    @Mock
    private ApiCallHistoryRepository apiCallHistoryRepository;
    @Mock
    private TeamRepository teamRepository;

    private TaskService taskService;

    @BeforeEach
    void setUp() {
        taskService = new TaskService(
            taskRepository,
            taskParticipantRepository,
            taskLoadRepository,
            taskAllocationRepository,
            entityManager,
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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {1, 10, 100})
    void planningBatchLoadsSharedDictionariesAndJiraOnce(int size) {
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        var release = new com.sber.isu.sprints_planning.model.ReleaseEntity();
        release.setId(UUID.randomUUID()); release.setPromDate(LocalDate.of(2032, 2, 15));
        when(participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc("team-a")).thenReturn(List.of(participant));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(releaseRepository.findAllByTeamKeyOrderByPromDateAsc("team-a")).thenReturn(List.of(release));
        when(taskRepository.save(any(TaskEntity.class))).thenAnswer(invocation -> {
            TaskEntity task = invocation.getArgument(0); task.setId(UUID.randomUUID()); return task;
        });
        when(taskRepository.findMaxWorkspaceOrder("team-a", "BACKLOG")).thenReturn(100);
        List<TaskService.PlanningMutation> mutations = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            mutations.add(new TaskService.PlanningMutation(new TaskCreateRequest(
                "Task " + i, "", "", (short) 1, "backlog", List.of(), List.of(),
                List.of(participant.getId().toString()), List.of(), List.of(sprint.getId().toString()),
                i % 2 == 0 ? Map.of() : Map.of(sprint.getId().toString(), BigDecimal.ONE),
                i % 2 == 0 ? Map.of() : Map.of(participant.getId().toString(), Map.of(sprint.getId().toString(), BigDecimal.ONE)),
                Map.of(), release.getId().toString(), null, participant.getId().toString(), null
            ), null));
        }
        List<TaskDto> result = taskService.applyPlanningBatch("team-a", mutations);
        assertThat(result).hasSize(size);
        assertThat(result.get(0).order()).isEqualTo(101);
        assertThat(result.get(size - 1).order()).isEqualTo(100 + size);
        verify(taskRepository).findMaxWorkspaceOrder("team-a", "BACKLOG");
        verify(taskRepository, never()).incrementWorkspaceOrderFrom(any(), any(), org.mockito.ArgumentMatchers.anyInt());
        assertThat(result).allSatisfy(task -> {
            assertThat(task.participantIds()).containsExactly(participant.getId().toString());
            assertThat(task.loads()).isEqualTo(Integer.parseInt(task.title().substring(5)) % 2 == 0
                ? Map.of() : Map.of(sprint.getId().toString(), new BigDecimal("1.0")));
            assertThat(task.leaderId()).isEqualTo(participant.getId().toString());
        });
        ArgumentCaptor<TaskEntity> savedTasks = ArgumentCaptor.forClass(TaskEntity.class);
        verify(taskRepository, org.mockito.Mockito.times(size)).save(savedTasks.capture());
        assertThat(savedTasks.getAllValues()).allSatisfy(task ->
            assertThat(task.getLoads()).hasSize(Integer.parseInt(task.getTitle().substring(5)) % 2));
        verify(sprintRepository).findByTeamKeyOrderByQuarterAndOrder("team-a");
        verify(participantRepository).findAllByTeamKeyOrderByDisplayOrderAsc("team-a");
        verify(releaseRepository).findAllByTeamKeyOrderByPromDateAsc("team-a");
        verify(participantRepository, never()).findByIdAndTeamKey(any(), any());
        verify(releaseRepository, never()).findByIdAndTeamKey(any(), any());
        verify(sprintRepository, never()).findByTeamKeyAndIdIn(any(), any());
        verify(taskJiraIssueRepository).findAllByTeamKeyAndTaskIdIn(eq("team-a"), any());
    }

    @Test
    void updatingTaskKeepsInactiveAssigneeLeaderAndAllocations() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        participant.setActive(false);
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        task.getParticipants().add(participantLink(task, participant, "team-a"));
        task.setLeaderParticipant(participant);
        task.getAllocations().add(taskAllocation(task, participant, sprint, new BigDecimal("3.0")));
        task.getLoads().add(taskLoad(task, sprint, new BigDecimal("3.0")));
        task.setNotes(Map.of(participant.getId(), "Historical note"));
        when(taskRepository.findWithDetailsById(task.getId(), "team-a")).thenReturn(task);
        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a")).thenReturn(Optional.of(task));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(participantRepository.findByIdAndTeamKey(participant.getId(), "team-a")).thenReturn(Optional.of(participant));

        TaskDto result = taskService.update("team-a", new TaskUpdateRequest(
            task.getId().toString(), "Updated title", null, null, null, null, null, null,
            List.of(participant.getId().toString()), null, null, null, null, null, null, null,
            participant.getId().toString(), null
        ));

        assertThat(result.title()).isEqualTo("Updated title");
        assertThat(result.participantIds()).containsExactly(participant.getId().toString());
        assertThat(result.leaderId()).isEqualTo(participant.getId().toString());
        assertThat(result.allocations().get(participant.getId().toString()))
            .containsEntry(sprint.getId().toString(), new BigDecimal("3.0"));
        assertThat(result.notes()).containsEntry(participant.getId().toString(), "Historical note");
        verify(taskJiraIssueRepository, never()).deleteAllByTeamKeyAndTaskIdAndParticipantIdIn(any(), any(), any());
    }

    @Test
    void setAllocationsUpdatesOnlyRequestedCellsAndAffectedSprintLoads() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        Set<UUID> participantIds = Set.of(participant.getId());
        Set<UUID> sprintIds = Set.of(sprint.getId());

        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a"))
            .thenReturn(Optional.of(task));
        when(taskParticipantRepository.findAssignedParticipantIds(task.getId(), "team-a", participantIds))
            .thenReturn(List.of(participant.getId()));
        when(sprintRepository.findByTeamKeyAndIdIn("team-a", sprintIds)).thenReturn(List.of(sprint));
        when(participantRepository.findByTeamKeyAndIdIn("team-a", participantIds)).thenReturn(List.of(participant));
        TaskAllocationEntity existingAllocation = taskAllocation(task, participant, sprint, new BigDecimal("1.0"));
        when(taskAllocationRepository.findEntitiesForCells(task.getId(), "team-a", participantIds, sprintIds))
            .thenReturn(List.of(existingAllocation));
        when(taskAllocationRepository.sumDaysByTaskAndSprints(task.getId(), "team-a", sprintIds))
            .thenReturn(List.of(loadValue(sprint.getId(), "2.5")));
        when(taskLoadRepository.findEntitiesForSprints(task.getId(), "team-a", sprintIds))
            .thenReturn(List.of());
        when(taskLoadRepository.findValuesForSprints(task.getId(), "team-a", List.of(sprint.getId())))
            .thenReturn(List.of(loadValue(sprint.getId(), "2.5")));

        var result = taskService.setAllocations(
            "team-a",
            task.getId(),
            new TaskAllocationsSetRequest(List.of(new TaskAllocationChangeRequest(
                participant.getId(),
                sprint.getId(),
                new BigDecimal("2.5")
            )))
        );

        assertThat(result.taskId()).isEqualTo(task.getId().toString());
        assertThat(result.cells()).singleElement().satisfies(cell -> {
            assertThat(cell.participantId()).isEqualTo(participant.getId().toString());
            assertThat(cell.sprintId()).isEqualTo(sprint.getId().toString());
            assertThat(cell.days()).isEqualByComparingTo("2.5");
        });
        assertThat(result.loads()).containsExactlyEntriesOf(
            Map.of(sprint.getId().toString(), new BigDecimal("2.5"))
        );
        assertThat(task.getUpdatedAt()).isEqualTo(LocalDate.now());

        assertThat(existingAllocation.getDays()).isEqualByComparingTo("2.5");
        verify(taskAllocationRepository, never()).saveAll(any());
        verify(taskAllocationRepository).sumDaysByTaskAndSprints(task.getId(), "team-a", sprintIds);
        verify(entityManager).persist(any(TaskLoadEntity.class));
        verify(taskRepository, never()).findWithDetailsById(any(), any());
        verify(sprintRepository, never()).findByTeamKeyOrderByQuarterAndOrder(any());
    }

    @Test
    void setAllocationsSkipsWritesWhenValueDidNotChange() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        Set<UUID> participantIds = Set.of(participant.getId());
        Set<UUID> sprintIds = Set.of(sprint.getId());

        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a"))
            .thenReturn(Optional.of(task));
        when(taskParticipantRepository.findAssignedParticipantIds(task.getId(), "team-a", participantIds))
            .thenReturn(List.of(participant.getId()));
        when(sprintRepository.findByTeamKeyAndIdIn("team-a", sprintIds)).thenReturn(List.of(sprint));
        when(participantRepository.findByTeamKeyAndIdIn("team-a", participantIds)).thenReturn(List.of(participant));
        TaskAllocationEntity existingAllocation = taskAllocation(
            task, participant, sprint, new BigDecimal("2.5")
        );
        when(taskAllocationRepository.findEntitiesForCells(task.getId(), "team-a", participantIds, sprintIds))
            .thenReturn(List.of(existingAllocation));
        when(taskLoadRepository.findValuesForSprints(task.getId(), "team-a", List.of(sprint.getId())))
            .thenReturn(List.of(loadValue(sprint.getId(), "2.5")));

        var result = taskService.setAllocations(
            "team-a",
            task.getId(),
            new TaskAllocationsSetRequest(List.of(new TaskAllocationChangeRequest(
                participant.getId(),
                sprint.getId(),
                new BigDecimal("2.5")
            )))
        );

        assertThat(result.updatedAt()).isEqualTo(LocalDate.of(2026, 1, 1));
        verify(taskAllocationRepository, never()).saveAll(any());
        verify(taskAllocationRepository, never()).deleteAll(any());
        verify(taskAllocationRepository, never()).sumDaysByTaskAndSprints(any(), any(), any());
    }

    @Test
    void upsertAllocationCreatesAllocationAndRecalculatesTaskLoad() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        TaskAllocationId allocationId = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
        TaskLoadId loadId = new TaskLoadId(task.getId(), sprint.getId());

        commonTaskStubs(task, sprint);
        when(participantRepository.findByIdAndTeamKey(participant.getId(), "team-a")).thenReturn(Optional.of(participant));
        when(sprintRepository.findByIdAndTeamKey(sprint.getId(), "team-a")).thenReturn(Optional.of(sprint));
        when(taskAllocationRepository.findById(allocationId)).thenAnswer(invocation -> findAllocation(task, allocationId));

        TaskDto result = taskService.upsertAllocation(
            "team-a",
            new TaskAllocationRequest(task.getId().toString(), participant.getId().toString(), sprint.getId().toString(), new BigDecimal("5"))
        );

        assertThat(result.allocations()).containsKey(participant.getId().toString());
        assertThat(result.allocations().get(participant.getId().toString()))
            .containsEntry(sprint.getId().toString(), new BigDecimal("5.0"));
        assertThat(result.loads()).containsEntry(sprint.getId().toString(), new BigDecimal("5.0"));
        assertThat(task.getAllocations()).hasSize(1);
        assertThat(task.getLoads()).hasSize(1);
    }

    @Test
    void upsertAllocationWithZeroRemovesAllocationAndDerivedLoad() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        TaskAllocationId allocationId = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
        TaskLoadId loadId = new TaskLoadId(task.getId(), sprint.getId());

        commonTaskStubs(task, sprint);
        when(participantRepository.findByIdAndTeamKey(participant.getId(), "team-a")).thenReturn(Optional.of(participant));
        when(sprintRepository.findByIdAndTeamKey(sprint.getId(), "team-a")).thenReturn(Optional.of(sprint));
        when(taskAllocationRepository.findById(allocationId)).thenAnswer(invocation -> findAllocation(task, allocationId));

        taskService.upsertAllocation(
            "team-a",
            new TaskAllocationRequest(task.getId().toString(), participant.getId().toString(), sprint.getId().toString(), new BigDecimal("5"))
        );

        TaskDto result = taskService.upsertAllocation(
            "team-a",
            new TaskAllocationRequest(task.getId().toString(), participant.getId().toString(), sprint.getId().toString(), BigDecimal.ZERO)
        );

        assertThat(result.allocations()).doesNotContainKey(participant.getId().toString());
        assertThat(result.loads()).doesNotContainKey(sprint.getId().toString());
        assertThat(task.getAllocations()).isEmpty();
        assertThat(task.getLoads()).isEmpty();
    }

    @Test
    void updateParticipantReplacementMovesSoleSprintAllocationWithoutDeletingDerivedLoad() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity oldParticipant = participant("22222222-2222-2222-2222-222222222222");
        ParticipantEntity newParticipant = participant("44444444-4444-4444-4444-444444444444");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        TaskLoadId loadId = new TaskLoadId(task.getId(), sprint.getId());

        task.getParticipants().add(participantLink(task, oldParticipant, "team-a"));
        task.getAllocations().add(taskAllocation(task, oldParticipant, sprint, new BigDecimal("3.0")));
        task.getLoads().add(taskLoad(task, sprint, new BigDecimal("3.0")));

        when(taskRepository.findWithDetailsById(task.getId(), "team-a")).thenReturn(task);
        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a")).thenReturn(Optional.of(task));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(participantRepository.findByTeamKeyAndIdIn("team-a", Set.of(newParticipant.getId()))).thenReturn(List.of(newParticipant));
        lenient().when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdIn("team-a", Set.of(task.getId()))).thenReturn(List.of());

        TaskDto result = taskService.update("team-a", new TaskUpdateRequest(
            task.getId().toString(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of(newParticipant.getId().toString()),
            null,
            null,
            null,
            Map.of(newParticipant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("3.0"))),
            null,
            null,
            null,
            null,
            null
        ));

        assertThat(result.participantIds()).containsExactly(newParticipant.getId().toString());
        assertThat(result.allocations()).containsKey(newParticipant.getId().toString());
        assertThat(result.loads()).containsEntry(sprint.getId().toString(), new BigDecimal("3.0"));
        assertThat(task.getAllocations()).hasSize(1);
        assertThat(task.getLoads()).hasSize(1);
        verify(taskLoadRepository, never()).delete(any(TaskLoadEntity.class));
    }

    @Test
    void participantWorkloadPagesParticipantsAndReturnsOnlyParticipantAllocations() {
        ParticipantEntity first = participant("11111111-1111-1111-1111-111111111111");
        ParticipantEntity second = participant("22222222-2222-2222-2222-222222222222");
        ParticipantEntity third = participant("33333333-3333-3333-3333-333333333333");
        SprintEntity sprint = sprint("44444444-4444-4444-4444-444444444444");
        TaskEntity task = task("55555555-5555-5555-5555-555555555555");
        task.setPriority((short) 1);
        task.getParticipants().add(participantLink(task, second, "team-a"));
        task.getParticipants().add(participantLink(task, third, "team-a"));
        task.getAllocations().add(taskAllocation(task, second, sprint, new BigDecimal("2.0")));
        task.getAllocations().add(taskAllocation(task, third, sprint, new BigDecimal("4.0")));

        when(participantRepository.findWorkloadPage(eq("team-a"), any(TaskFilter.class), eq(1), eq(1)))
            .thenReturn(new PageImpl<>(List.of(second), PageRequest.of(1, 1), 3));
        when(taskRepository.findParticipantWorkloadRows(eq("team-a"), any(TaskFilter.class), eq(Set.of(second.getId()))))
            .thenReturn(List.of(
                new ParticipantWorkloadTaskFlatRow(
                    second.getId(),
                    task.getId(),
                    task.getTitle(),
                    task.getPriority(),
                    task.getStatus(),
                    null,
                    "Backend",
                    sprint.getId(),
                    new BigDecimal("2.0")
                )
            ));

        Page<ParticipantWorkloadRowDto> result = taskService.findParticipantWorkloadPage(
            "team-a",
            TaskFilter.from(
                sprint.getQuarter().getId().toString(),
                "1,2,3",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            ),
            1,
            1
        );

        assertThat(result.getTotalElements()).isEqualTo(3);
        assertThat(result.getContent()).hasSize(1);
        ParticipantWorkloadRowDto row = result.getContent().get(0);
        assertThat(row.participant().id()).isEqualTo(second.getId().toString());
        assertThat(row.tasks()).hasSize(1);
        assertThat(row.tasks().get(0).allocations())
            .containsEntry(sprint.getId().toString(), new BigDecimal("2.0"));

        ArgumentCaptor<TaskFilter> participantFilterCaptor = ArgumentCaptor.forClass(TaskFilter.class);
        verify(participantRepository).findWorkloadPage(eq("team-a"), participantFilterCaptor.capture(), eq(1), eq(1));
        assertThat(participantFilterCaptor.getValue().quarterIds())
            .containsExactly(sprint.getQuarter().getId());
        assertThat(participantFilterCaptor.getValue().priorities())
            .containsExactlyInAnyOrder((short) 1, (short) 2, (short) 3);

        ArgumentCaptor<TaskFilter> taskFilterCaptor = ArgumentCaptor.forClass(TaskFilter.class);
        verify(taskRepository).findParticipantWorkloadRows(
            eq("team-a"),
            taskFilterCaptor.capture(),
            eq(Set.of(second.getId()))
        );
        assertThat(taskFilterCaptor.getValue().participantIds())
            .containsExactly(second.getId());
        verify(taskRepository, never()).findFilteredWithDetails(eq("team-a"), any(TaskFilter.class));
    }

    @Test
    void participantWorkloadRequiresQuarterFilter() {
        assertThatThrownBy(() -> taskService.findParticipantWorkloadPage("team-a", TaskFilter.empty(), 0, 10))
            .isInstanceOfSatisfying(ResponseStatusException.class, error ->
                assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void upsertLoadRejectsTaskWithParticipants() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        task.getParticipants().add(participantLink(task, participant, "team-a"));
        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a")).thenReturn(Optional.of(task));

        assertThatThrownBy(() -> taskService.upsertLoad(
            "team-a",
            new com.sber.isu.sprints_planning.dto.request.TaskLoadRequest(
                task.getId().toString(),
                "33333333-3333-3333-3333-333333333333",
                new BigDecimal("3")
            )
        ))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> {
                ResponseStatusException ex = (ResponseStatusException) error;
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            });
    }

    @Test
    void createSynchronizesLegacyCustomerAndStreamFields() {
        AtomicReference<TaskEntity> savedTask = new AtomicReference<>();
        lenient().when(taskRepository.save(org.mockito.ArgumentMatchers.any(TaskEntity.class))).thenAnswer(invocation -> {
            TaskEntity entity = invocation.getArgument(0);
            if (entity.getId() == null) {
                entity.setId(UUID.fromString("44444444-4444-4444-4444-444444444444"));
            }
            savedTask.set(entity);
            return entity;
        });
        lenient().when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of());
        lenient().when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdIn(
            org.mockito.ArgumentMatchers.eq("team-a"),
            org.mockito.ArgumentMatchers.anySet()
        )).thenReturn(List.of());
        when(taskCustomerRepository.findByNamesAndTeamKey(Set.of("B Customer", "A Customer"), "team-a")).thenReturn(List.of());
        when(taskStreamRepository.findByNamesAndTeamKey(Set.of("B Stream", "A Stream"), "team-a")).thenReturn(List.of());
        when(taskCustomerRepository.save(org.mockito.ArgumentMatchers.any(TaskCustomerEntity.class))).thenAnswer(invocation -> {
            TaskCustomerEntity entity = invocation.getArgument(0);
            entity.setId(UUID.randomUUID());
            return entity;
        });
        when(taskStreamRepository.save(org.mockito.ArgumentMatchers.any(TaskStreamEntity.class))).thenAnswer(invocation -> {
            TaskStreamEntity entity = invocation.getArgument(0);
            entity.setId(UUID.randomUUID());
            return entity;
        });

        taskService.create("team-a", new TaskCreateRequest(
            "Task",
            "Desc",
            "DoD",
            (short) 2,
            "inprogress",
            List.of("B Customer", "A Customer"),
            List.of("B Stream", "A Stream"),
            List.of(),
            List.of(),
            List.of(),
            null,
            null,
            null,
            null,
            null,
            null,
            null
        ));

        assertThat(savedTask.get()).isNotNull();
        assertThat(savedTask.get().getCustomer()).isEqualTo("A Customer");
        assertThat(savedTask.get().getStream()).isEqualTo("A Stream");
    }

    @Test
    void updateJiraLinksSavesStoryAndParticipantIssueLinks() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333");
        task.getParticipants().add(participantLink(task, participant, "team-a"));
        List<TaskJiraIssueEntity> savedIssues = new ArrayList<>();

        when(taskRepository.findWithDetailsById(task.getId(), "team-a")).thenReturn(task);
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(taskJiraIssueRepository.findFirstByTeamKeyAndTaskIdAndIssueScopeOrderByCreatedAtAsc(
            "team-a",
            task.getId(),
            "STORY"
        )).thenReturn(Optional.empty());
        when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdAndIssueScope(
            "team-a",
            task.getId(),
            "PARTICIPANT"
        )).thenReturn(List.of());
        when(participantRepository.findByIdAndTeamKey(participant.getId(), "team-a")).thenReturn(Optional.of(participant));
        when(sprintRepository.findByIdAndTeamKey(sprint.getId(), "team-a")).thenReturn(Optional.of(sprint));
        when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintId(
            "team-a",
            task.getId(),
            participant.getId(),
            sprint.getId()
        )).thenReturn(List.of());
        when(taskJiraIssueRepository.saveAndFlush(org.mockito.ArgumentMatchers.any(TaskJiraIssueEntity.class)))
            .thenAnswer(invocation -> {
                TaskJiraIssueEntity entity = invocation.getArgument(0);
                if (entity.getId() == null) {
                    entity.setId(UUID.randomUUID());
                }
                savedIssues.removeIf(issue -> issue.getId().equals(entity.getId()));
                savedIssues.add(entity);
                return entity;
            });
        when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdIn(
            org.mockito.ArgumentMatchers.eq("team-a"),
            org.mockito.ArgumentMatchers.anySet()
        )).thenAnswer(invocation -> List.copyOf(savedIssues));

        TaskDto result = taskService.updateJiraLinks(
            "team-a",
            task.getId(),
            new TaskJiraLinksUpdateRequest(
                "https://jira.sberbank.ru/browse/TEAM-10",
                List.of(new TaskParticipantJiraLinkUpdateRequest(
                    participant.getId().toString(),
                    sprint.getId().toString(),
                    "TEAM-11"
                ))
            )
        );

        assertThat(result.jiraStoryIssue()).isNotNull();
        assertThat(result.jiraStoryIssue().jiraIssueKey()).isEqualTo("TEAM-10");
        assertThat(result.jiraIssues())
            .containsKey(participant.getId().toString());
        assertThat(result.jiraIssues().get(participant.getId().toString()).get(sprint.getId().toString()).jiraIssueKey())
            .isEqualTo("TEAM-11");
    }

    private void commonTaskStubs(TaskEntity task, SprintEntity sprint) {
        when(taskRepository.findByIdAndTeamKeyForUpdate(task.getId(), "team-a")).thenReturn(Optional.of(task));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        lenient().when(taskJiraIssueRepository.findAllByTeamKeyAndTaskIdIn("team-a", Set.of(task.getId()))).thenReturn(List.of());
    }

    private Optional<TaskAllocationEntity> findAllocation(TaskEntity task, TaskAllocationId id) {
        return task.getAllocations().stream()
            .filter(allocation -> allocation.getId() != null && allocation.getId().equals(id))
            .findFirst();
    }

    private Optional<TaskLoadEntity> findLoad(TaskEntity task, TaskLoadId id) {
        return task.getLoads().stream()
            .filter(load -> load.getId() != null && load.getId().equals(id))
            .findFirst();
    }

    private TaskAllocationEntity taskAllocation(
        TaskEntity task,
        ParticipantEntity participant,
        SprintEntity sprint,
        BigDecimal days
    ) {
        TaskAllocationEntity allocation = new TaskAllocationEntity();
        allocation.setId(new TaskAllocationId(task.getId(), participant.getId(), sprint.getId()));
        allocation.setTask(task);
        allocation.setParticipant(participant);
        allocation.setSprint(sprint);
        allocation.setDays(days);
        allocation.setTeamKey("team-a");
        return allocation;
    }

    private TaskLoadEntity taskLoad(TaskEntity task, SprintEntity sprint, BigDecimal days) {
        TaskLoadEntity load = new TaskLoadEntity();
        load.setId(new TaskLoadId(task.getId(), sprint.getId()));
        load.setTask(task);
        load.setSprint(sprint);
        load.setDays(days);
        load.setTeamKey("team-a");
        return load;
    }

    private TaskEntity task(String id) {
        TaskEntity entity = new TaskEntity();
        entity.setId(UUID.fromString(id));
        entity.setTitle("Task");
        entity.setDescription("Desc");
        entity.setDod("DoD");
        entity.setPriority((short) 2);
        entity.setStatus("inprogress");
        entity.setCreatedAt(LocalDate.of(2026, 1, 1));
        entity.setUpdatedAt(LocalDate.of(2026, 1, 1));
        entity.setTeamKey("team-a");
        return entity;
    }

    private com.sber.isu.sprints_planning.model.TaskParticipantEntity participantLink(
        TaskEntity task,
        ParticipantEntity participant,
        String teamKey
    ) {
        com.sber.isu.sprints_planning.model.TaskParticipantEntity link =
            new com.sber.isu.sprints_planning.model.TaskParticipantEntity();
        link.setId(new com.sber.isu.sprints_planning.model.TaskParticipantId(task.getId(), participant.getId()));
        link.setTask(task);
        link.setParticipant(participant);
        link.setTeamKey(teamKey);
        return link;
    }

    private ParticipantEntity participant(String id) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(UUID.fromString(id));
        entity.setFullName("Participant");
        entity.setRole("DEV");
        entity.setRate(new BigDecimal("1.0"));
        entity.setTeamKey("team-a");
        return entity;
    }

    private SprintEntity sprint(String id) {
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
        quarter.setName("Q1");
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));

        SprintEntity sprint = new SprintEntity();
        sprint.setId(UUID.fromString(id));
        sprint.setQuarter(quarter);
        sprint.setName("Sprint 1");
        sprint.setStartDate(LocalDate.of(2026, 1, 12));
        sprint.setEndDate(LocalDate.of(2026, 1, 23));
        sprint.setWorkingDays(10);
        sprint.setOrder(1);
        sprint.setTeamKey("team-a");
        return sprint;
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
}
