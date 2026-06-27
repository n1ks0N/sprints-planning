package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskJiraLinksUpdateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskParticipantJiraLinkUpdateRequest;
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
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.ArrayList;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
                teamRepository,
                Runnable::run
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

    @Test
    void upsertLoadRejectsTaskWithParticipants() {
        TaskEntity task = task("11111111-1111-1111-1111-111111111111");
        ParticipantEntity participant = participant("22222222-2222-2222-2222-222222222222");
        task.getParticipants().add(participantLink(task, participant, "team-a"));
        when(taskRepository.findByIdAndTeamKey(task.getId(), "team-a")).thenReturn(Optional.of(task));

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
        lenient().when(taskRepository.findMaxDisplayOrder("team-a")).thenReturn(0);
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
}
