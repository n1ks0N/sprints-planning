package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
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
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaskServiceAllocationTest {

    @Mock
    private TaskRepository taskRepository;
    @Mock
    private TaskLoadRepository taskLoadRepository;
    @Mock
    private TaskAllocationRepository taskAllocationRepository;
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
            taskLoadRepository,
            taskAllocationRepository,
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
                teamRepository
            )
        );
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
        when(taskLoadRepository.findById(loadId)).thenAnswer(invocation -> findLoad(task, loadId));

        TaskDto result = taskService.upsertAllocation(
            "team-a",
            new TaskAllocationRequest(task.getId().toString(), participant.getId().toString(), sprint.getId().toString(), new BigDecimal("5"))
        );

        assertThat(result.allocations()).containsKey(participant.getId().toString());
        assertThat(result.allocations().get(participant.getId().toString()))
            .containsEntry(sprint.getId().toString(), new BigDecimal("5"));
        assertThat(result.loads()).containsEntry(sprint.getId().toString(), new BigDecimal("5"));
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
        when(taskLoadRepository.findById(loadId)).thenAnswer(invocation -> findLoad(task, loadId));

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

    private void commonTaskStubs(TaskEntity task, SprintEntity sprint) {
        when(taskRepository.findByIdAndTeamKey(task.getId(), "team-a")).thenReturn(Optional.of(task));
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
}
