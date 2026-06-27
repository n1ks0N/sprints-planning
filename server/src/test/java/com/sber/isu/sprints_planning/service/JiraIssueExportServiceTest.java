package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sber.isu.sprints_planning.config.JiraProperties;
import com.sber.isu.sprints_planning.dto.request.JiraIssueExportRequest;
import com.sber.isu.sprints_planning.model.JiraExportBatchEntity;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import com.sber.isu.sprints_planning.repository.JiraExportBatchRepository;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

class JiraIssueExportServiceTest {

    @Test
    void startExportMergesCommonAndTaskLabelsIntoJiraRequestPreview() {
        TaskRepository taskRepository = mock(TaskRepository.class);
        TaskJiraIssueRepository taskJiraIssueRepository = mock(TaskJiraIssueRepository.class);
        SprintRepository sprintRepository = mock(SprintRepository.class);
        JiraExportBatchRepository batchRepository = mock(JiraExportBatchRepository.class);
        TeamRepository teamRepository = mock(TeamRepository.class);
        ApiCallHistoryRepository historyRepository = mock(ApiCallHistoryRepository.class);
        ApiHistoryService apiHistoryService = new ApiHistoryService(
            historyRepository,
            new ApiActionDescriptionResolver(),
            teamRepository,
            Runnable::run
        );
        EntityManager entityManager = entityManagerReturningReferences();
        PlatformTransactionManager transactionManager = noOpTransactionManager();

        UUID taskId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID participantId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        UUID sprintId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        SprintEntity sprint = sprint(sprintId);
        ParticipantEntity participant = participant(participantId);
        TaskEntity task = task(taskId);
        task.getParticipants().add(participantLink(task, participant));
        task.getAllocations().add(allocation(task, participant, sprint, new BigDecimal("5")));

        when(sprintRepository.findByIdAndTeamKey(sprintId, "team-a")).thenReturn(java.util.Optional.of(sprint));
        when(taskRepository.findAllByIdInAndTeamKey(List.of(taskId), "team-a")).thenReturn(List.of(task));
        AtomicReference<JiraExportBatchEntity> savedBatch = new AtomicReference<>();
        when(batchRepository.save(any(JiraExportBatchEntity.class))).thenAnswer(invocation -> {
            JiraExportBatchEntity batch = invocation.getArgument(0);
            batch.setId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
            savedBatch.set(batch);
            return batch;
        });

        JiraIssueExportService service = new JiraIssueExportService(
            taskRepository,
            taskJiraIssueRepository,
            sprintRepository,
            batchRepository,
            teamRepository,
            apiHistoryService,
            new JiraProperties(null, true),
            entityManager,
            transactionManager,
            command -> {
            },
            new ObjectMapper()
        );

        service.startExport(
            "team-a",
            new JiraIssueExportRequest(
                List.of(taskId.toString()),
                sprintId.toString(),
                "12345",
                "team",
                Map.of(taskId.toString(), List.of(participantId.toString())),
                Map.of(taskId.toString(), false),
                List.of("common_label"),
                Map.of(taskId.toString(), List.of("plan_release_20260627"))
            ),
            "session-1",
            "user"
        );

        assertThat(savedBatch.get()).isNotNull();
        assertThat(savedBatch.get().getItemsJson()).hasSize(1);

        Map<String, Object> item = savedBatch.get().getItemsJson().get(0);
        assertThat(item.get("labels")).asList()
            .containsExactly("common_label", "plan_release_20260627");

        Map<String, Object> jiraRequest = asMap(item.get("jiraRequest"));
        Map<String, Object> body = asMap(jiraRequest.get("body"));
        Map<String, Object> fields = asMap(body.get("fields"));
        assertThat(fields.get("labels")).asList()
            .containsExactly("common_label", "plan_release_20260627");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static EntityManager entityManagerReturningReferences() {
        return (EntityManager) Proxy.newProxyInstance(
            EntityManager.class.getClassLoader(),
            new Class<?>[] { EntityManager.class },
            (_proxy, method, args) -> {
                if ("getReference".equals(method.getName()) && args != null && args.length == 2) {
                    return args[1] instanceof UUID id ? sprint(id) : null;
                }
                throw new UnsupportedOperationException(method.getName());
            }
        );
    }

    private static PlatformTransactionManager noOpTransactionManager() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }

    private static TaskEntity task(UUID id) {
        TaskEntity entity = new TaskEntity();
        entity.setId(id);
        entity.setTitle("Task");
        entity.setDescription("Desc");
        entity.setDod("DoD");
        entity.setPriority((short) 2);
        entity.setStatus("inprogress");
        entity.setTeamKey("team-a");
        entity.setCreatedAt(LocalDate.of(2026, 1, 1));
        entity.setUpdatedAt(LocalDate.of(2026, 1, 1));
        return entity;
    }

    private static ParticipantEntity participant(UUID id) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(id);
        entity.setFullName("Participant");
        entity.setRole("DEV");
        entity.setRate(BigDecimal.ONE);
        entity.setJiraLogin("participant");
        entity.setTeamKey("team-a");
        return entity;
    }

    private static SprintEntity sprint(UUID id) {
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));
        quarter.setName("Q1");
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));

        SprintEntity sprint = new SprintEntity();
        sprint.setId(id);
        sprint.setQuarter(quarter);
        sprint.setName("Sprint 1");
        sprint.setStartDate(LocalDate.of(2026, 1, 12));
        sprint.setEndDate(LocalDate.of(2026, 1, 23));
        sprint.setWorkingDays(10);
        sprint.setTeamKey("team-a");
        return sprint;
    }

    private static TaskParticipantEntity participantLink(TaskEntity task, ParticipantEntity participant) {
        TaskParticipantEntity link = new TaskParticipantEntity();
        link.setId(new TaskParticipantId(task.getId(), participant.getId()));
        link.setTask(task);
        link.setParticipant(participant);
        link.setTeamKey("team-a");
        return link;
    }

    private static TaskAllocationEntity allocation(
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
}
