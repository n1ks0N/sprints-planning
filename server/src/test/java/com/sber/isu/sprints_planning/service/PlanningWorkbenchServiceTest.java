package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.sber.isu.sprints_planning.config.CapacityProperties;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyItemPatchRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchItemRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchPreviewRequest;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.PlanningBacklogItemEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskPlanningDemandValue;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.PlanningBacklogItemRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.service.planning.PlanningDraftTask;
import com.sber.isu.sprints_planning.service.planning.PlannerType;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverInput;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverPort;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverResult;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PlanningWorkbenchServiceTest {

    private final Map<UUID, PlanningBacklogItemEntity> items = new LinkedHashMap<>();
    private final List<ParticipantEntity> participants = new ArrayList<>();
    private final Map<UUID, SprintEntity> sprints = new LinkedHashMap<>();
    private final Map<UUID, QuarterEntity> quarters = new LinkedHashMap<>();
    private int maxDisplayOrder;

    private CapturingTaskService taskService;
    private CapturingPlanner planner;
    private PlanningWorkbenchService service;

    @BeforeEach
    void setUp() {
        taskService = new CapturingTaskService();
        planner = new CapturingPlanner();
        items.clear();
        participants.clear();
        sprints.clear();
        quarters.clear();
        maxDisplayOrder = 0;

        service = new PlanningWorkbenchService(
            planningRepo(),
            participantRepo(),
            sprintRepo(),
            quarterRepo(),
            releaseRepo(),
            taskAllocationRepo(),
            taskService,
            new CapacityProperties(1.0, 0.8),
            List.of(planner)
        );
    }

    @Test
    void getBacklogCandidatesReturnsSeparatePlanningItems() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue("ROLE", "DEV", null, "Core", new BigDecimal("5"))));
        items.put(item.getId(), item);

        var result = service.getBacklogCandidates("team-a");

        assertThat(result).singleElement().satisfies(dto -> {
            assertThat(dto.id()).isEqualTo(item.getId().toString());
            assertThat(dto.estimateDays()).isEqualByComparingTo("5");
            assertThat(dto.loads()).isEmpty();
            assertThat(dto.allocations()).isEmpty();
        });
    }

    @Test
    void createItemStoresSeparatePlanningEntity() {
        maxDisplayOrder = 3;
        var result = service.createItem("team-a", new PlanningWorkbenchItemRequest(
            "Task",
            "Desc",
            "DoD",
            (short) 1,
            List.of("Customer A"),
            List.of("Core"),
            List.of(new com.sber.isu.sprints_planning.dto.request.TaskPlanningDemandRequest(
                "ROLE",
                "DEV",
                null,
                "Core",
                new BigDecimal("4")
            )),
            null,
            null,
            List.of(),
            List.of(),
            null
        ));

        assertThat(result.title()).isEqualTo("Task");
        assertThat(result.order()).isEqualTo(4);
        assertThat(items).hasSize(1);
    }

    @Test
    void previewPassesPlanningItemsToSolver() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(
            new TaskPlanningDemandValue("ROLE", "QA", null, "Core", new BigDecimal("4")),
            new TaskPlanningDemandValue(
                "PARTICIPANT",
                null,
                UUID.fromString("11111111-1111-1111-1111-111111111111"),
                "Core",
                new BigDecimal("2")
            )
        ));
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        items.put(item.getId(), item);
        participants.add(participant("11111111-1111-1111-1111-111111111111", "Dev 1"));
        sprints.put(sprint.getId(), sprint);

        service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(planner.lastInput).isNotNull();
        assertThat(planner.lastInput.tasks()).hasSize(2);
        assertThat(planner.lastInput.tasks())
            .extracting(PlanningDraftTask::estimateDays)
            .containsExactlyInAnyOrder(8, 4);
        assertThat(planner.lastInput.sprints())
            .extracting(SprintEntity::getWorkingDays)
            .containsExactly(20);
    }

    @Test
    void previewSupportsHalfDayOnlyDemand() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("0.5")
        )));
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        sprints.put(sprint.getId(), sprint);
        planner.nextResult = new PlanningSolverResult(
            PlannerType.ALGORITHM,
            Map.of(item.getId().toString(), Map.of(
                participant.getId().toString(), Map.of(sprint.getId().toString(), BigDecimal.ONE)
            )),
            List.of(),
            BigDecimal.ONE,
            BigDecimal.ZERO
        );

        var preview = service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(planner.lastInput.tasks()).singleElement().satisfies(task ->
            assertThat(task.estimateDays()).isEqualTo(1)
        );
        assertThat(preview.summary().plannedDays()).isEqualByComparingTo("0.5");
        assertThat(preview.items().get(0).allocations().get(participant.getId().toString()))
            .containsEntry(sprint.getId().toString(), new BigDecimal("0.5"));
    }

    @Test
    void roleDemandWithoutParticipantStreamDoesNotInheritTaskStream() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setStreams(new ArrayList<>(List.of("Task Stream")));
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue("ROLE", "DEV", null, null, new BigDecimal("4"))));
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        items.put(item.getId(), item);
        participants.add(participant("11111111-1111-1111-1111-111111111111", "Dev 1"));
        sprints.put(sprint.getId(), sprint);

        service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(planner.lastInput).isNotNull();
        assertThat(planner.lastInput.tasks()).singleElement().satisfies(task -> {
            assertThat(task.role()).isEqualTo("DEV");
            assertThat(task.stream()).isNull();
        });
    }

    @Test
    void previewOrdersRelevantSprintsFromOldToNewEvenWhenItemStoresThemUnordered() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue("ROLE", "DEV", null, "Core", new BigDecimal("4"))));
        SprintEntity oldSprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        oldSprint.setStartDate(LocalDate.of(2026, 1, 12));
        oldSprint.setEndDate(LocalDate.of(2026, 1, 23));
        oldSprint.setOrder(1);
        SprintEntity newSprint = sprint("cccccccc-cccc-cccc-cccc-cccccccccccc", "Sprint 2");
        newSprint.setStartDate(LocalDate.of(2026, 1, 26));
        newSprint.setEndDate(LocalDate.of(2026, 2, 6));
        newSprint.setOrder(2);
        item.setPlanningSprintIds(List.of(newSprint.getId(), oldSprint.getId()));
        items.put(item.getId(), item);
        participants.add(participant("11111111-1111-1111-1111-111111111111", "Dev 1"));
        sprints.put(newSprint.getId(), newSprint);
        sprints.put(oldSprint.getId(), oldSprint);

        var preview = service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(preview.sprintIds()).containsExactly(oldSprint.getId().toString(), newSprint.getId().toString());
        assertThat(preview.participantSummary().get(0).cells())
            .extracting(cell -> cell.sprintId())
            .containsExactly(oldSprint.getId().toString(), newSprint.getId().toString());
    }

    @Test
    void previewSummaryCountsPlannedUnplannedAndOverloadedCellsFromSolverResult() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue("ROLE", "DEV", null, "Core", new BigDecimal("6"))));
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        sprint.setWorkingDays(3);
        item.setPlanningSprintIds(List.of(sprint.getId()));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        sprints.put(sprint.getId(), sprint);
        planner.nextResult = new PlanningSolverResult(
            PlannerType.ALGORITHM,
            Map.of(item.getId().toString(), Map.of(
                participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("10"))
            )),
            List.of(),
            new BigDecimal("10"),
            new BigDecimal("2")
        );

        var preview = service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(preview.summary().taskCount()).isEqualTo(1);
        assertThat(preview.summary().participantCount()).isEqualTo(1);
        assertThat(preview.summary().plannedDays()).isEqualByComparingTo("5");
        assertThat(preview.summary().unplannedDays()).isEqualByComparingTo("1");
        assertThat(preview.summary().overloadedCells()).isEqualTo(1);
        assertThat(preview.canApply()).isFalse();
        assertThat(preview.warnings()).contains("Не все дни распределены. Проверьте выбранные задачи и ограничения.");
    }

    @Test
    void previewKeepsSolverWarningAndDoesNotAddGenericWarningWhenEverythingPlanned() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue("ROLE", "DEV", null, "Core", new BigDecimal("2"))));
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        sprints.put(sprint.getId(), sprint);
        planner.nextResult = new PlanningSolverResult(
            PlannerType.ALGORITHM,
            Map.of(item.getId().toString(), Map.of(
                participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("4"))
            )),
            List.of("custom solver warning"),
            new BigDecimal("4"),
            BigDecimal.ZERO
        );

        var preview = service.preview("team-a", new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of(item.getId().toString())));

        assertThat(preview.summary().unplannedDays()).isEqualByComparingTo("0");
        assertThat(preview.warnings()).containsExactly("custom solver warning");
        assertThat(preview.canApply()).isFalse();
    }

    @Test
    void deleteItemRemovesPlanningEntity() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        items.put(item.getId(), item);

        service.deleteItem("team-a", item.getId().toString());

        assertThat(items).isEmpty();
    }

    @Test
    void applyCreatesRealTasksAndDeletesPlanningItems() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("5"))
                )),
                null
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.status()).isEqualTo("inprogress");
        assertThat(taskService.lastCreateRequest.loads()).containsEntry(sprint.getId().toString(), new BigDecimal("5.0"));
        assertThat(items).isEmpty();
    }

    @Test
    void applyAllowsManualAllocationDifferentFromPlanningDemand() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("3"))
                )),
                null
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.loads()).containsEntry(sprint.getId().toString(), new BigDecimal("3.0"));
        assertThat(taskService.lastCreateRequest.allocations())
            .containsEntry(participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("3.0")));
        assertThat(items).isEmpty();
    }

    @Test
    void applyCreatesTaskWithoutLoadsWhenManualReviewClearsAllAllocations() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of()),
                null
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.loads()).isEmpty();
        assertThat(taskService.lastCreateRequest.allocations()).isEmpty();
        assertThat(items).isEmpty();
    }

    @Test
    void applyAllowsPreviewPatchToAddParticipantOutsideOriginalRoleDemand() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "ROLE",
            "DEV",
            null,
            "Core",
            new BigDecimal("4")
        )));
        items.put(item.getId(), item);
        ParticipantEntity dev = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        ParticipantEntity qa = participant("22222222-2222-2222-2222-222222222222", "QA 1");
        qa.setRole("QA");
        participants.add(dev);
        participants.add(qa);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        PlanningWorkbenchApplyItemPatchRequest patch = new PlanningWorkbenchApplyItemPatchRequest(
            item.getTitle(),
            item.getDescription(),
            item.getDod(),
            item.getPriority(),
            "inprogress",
            item.getCustomers(),
            item.getStreams(),
            List.of(dev.getId().toString(), qa.getId().toString()),
            null,
            item.getReleaseDate() != null ? item.getReleaseDate().getId().toString() : null,
            item.getInitialQuarter().getId().toString(),
            List.of(item.getInitialQuarter().getId().toString()),
            List.of(sprint.getId().toString()),
            Map.of(),
            null,
            item.getDisplayOrder()
        );

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    dev.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("3")),
                    qa.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("1"))
                )),
                Map.of(item.getId().toString(), patch)
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.participantIds())
            .containsExactly(dev.getId().toString(), qa.getId().toString());
        assertThat(taskService.lastCreateRequest.allocations())
            .containsEntry(dev.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("3.0")))
            .containsEntry(qa.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("1.0")));
    }

    @Test
    void applyConvertsRoleDemandIntoSpecificParticipantDemandsFromPreviewAllocations() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "ROLE",
            "DEV",
            null,
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("5"))
                )),
                null
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.participantIds()).containsExactly(participant.getId().toString());
        assertThat(taskService.lastCreateRequest.loads())
            .containsEntry(sprint.getId().toString(), new BigDecimal("5.0"));
        assertThat(taskService.lastCreateRequest.allocations())
            .containsEntry(participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("5.0")));
    }

    @Test
    void applyDerivesPlanningQuarterFromAllocatedSprintWhenQuarterListIsEmpty() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningQuarterIds(new ArrayList<>());
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("5"))
                )),
                null
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest).isNotNull();
        assertThat(taskService.lastCreateRequest.planningQuarterIds())
            .containsExactly(sprint.getQuarter().getId().toString());
    }

    @Test
    void applyUsesEditedItemPatchFromReview() {
        PlanningBacklogItemEntity item = planningItem("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        item.setPlanningDemands(List.of(new TaskPlanningDemandValue(
            "PARTICIPANT",
            null,
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "Core",
            new BigDecimal("5")
        )));
        items.put(item.getId(), item);
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1");
        participants.add(participant);
        SprintEntity sprint = sprint("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "Sprint 1");
        item.setPlanningSprintIds(List.of(sprint.getId()));
        sprints.put(sprint.getId(), sprint);

        PlanningWorkbenchApplyItemPatchRequest patch = new PlanningWorkbenchApplyItemPatchRequest(
            "Edited title",
            "Edited desc",
            "Edited dod",
            (short) 1,
            "done",
            List.of("Edited customer"),
            List.of("Edited stream"),
            List.of(participant.getId().toString()),
            List.of(new com.sber.isu.sprints_planning.dto.request.TaskPlanningDemandRequest(
                "PARTICIPANT",
                null,
                participant.getId().toString(),
                "Core",
                new BigDecimal("5")
            )),
            null,
            item.getInitialQuarter().getId().toString(),
            List.of(item.getInitialQuarter().getId().toString()),
            List.of(sprint.getId().toString()),
            Map.of(participant.getId().toString(), "Edited note"),
            participant.getId().toString(),
            7
        );

        service.apply(
            "team-a",
            new PlanningWorkbenchApplyRequest(
                List.of(item.getId().toString()),
                Map.of(item.getId().toString(), Map.of(
                    participant.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("5"))
                )),
                Map.of(item.getId().toString(), patch)
            ),
            "session-1",
            "user"
        );

        assertThat(taskService.lastCreateRequest.title()).isEqualTo("Edited title");
        assertThat(taskService.lastCreateRequest.priority()).isEqualTo((short) 1);
        assertThat(taskService.lastCreateRequest.status()).isEqualTo("done");
        assertThat(taskService.lastCreateRequest.customers()).containsExactly("Edited customer");
        assertThat(taskService.lastCreateRequest.streams()).containsExactly("Edited stream");
        assertThat(taskService.lastCreateRequest.participantIds()).containsExactly(participant.getId().toString());
        assertThat(taskService.lastCreateRequest.notes()).containsEntry(participant.getId().toString(), "Edited note");
        assertThat(taskService.lastCreateRequest.leaderId()).isEqualTo(participant.getId().toString());
    }

    private PlanningBacklogItemRepository planningRepo() {
        return proxy(PlanningBacklogItemRepository.class, (method, args) -> switch (method.getName()) {
            case "findAllByTeamKeyOrderByDisplayOrderAscCreatedAtAsc" -> items.values().stream()
                .filter(item -> args[0].equals(item.getTeamKey()))
                .sorted((left, right) -> Integer.compare(left.getDisplayOrder(), right.getDisplayOrder()))
                .toList();
            case "findAllWithDetailsByTeamKeyAndIdIn" -> {
                String teamKey = (String) args[0];
                @SuppressWarnings("unchecked")
                Collection<UUID> ids = (Collection<UUID>) args[1];
                yield items.values().stream()
                    .filter(item -> teamKey.equals(item.getTeamKey()) && ids.contains(item.getId()))
                    .toList();
            }
            case "findWithDetailsById" -> {
                UUID id = (UUID) args[0];
                String teamKey = (String) args[1];
                PlanningBacklogItemEntity item = items.get(id);
                yield item != null && teamKey.equals(item.getTeamKey()) ? item : null;
            }
            case "findMaxDisplayOrder" -> maxDisplayOrder;
            case "save" -> {
                PlanningBacklogItemEntity item = (PlanningBacklogItemEntity) args[0];
                if (item.getId() == null) {
                    item.setId(UUID.randomUUID());
                }
                items.put(item.getId(), item);
                maxDisplayOrder = Math.max(maxDisplayOrder, item.getDisplayOrder());
                yield item;
            }
            case "deleteAll" -> {
                @SuppressWarnings("unchecked")
                Collection<PlanningBacklogItemEntity> deleting = (Collection<PlanningBacklogItemEntity>) args[0];
                deleting.forEach(item -> items.remove(item.getId()));
                yield null;
            }
            case "delete" -> {
                PlanningBacklogItemEntity deleting = (PlanningBacklogItemEntity) args[0];
                items.remove(deleting.getId());
                yield null;
            }
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    private ParticipantRepository participantRepo() {
        return proxy(ParticipantRepository.class, (method, args) -> switch (method.getName()) {
            case "findAllByTeamKeyOrderByDisplayOrderAsc" -> participants.stream()
                .filter(participant -> args[0].equals(participant.getTeamKey()))
                .toList();
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    private SprintRepository sprintRepo() {
        return proxy(SprintRepository.class, (method, args) -> switch (method.getName()) {
            case "findByTeamKeyAndIdIn" -> {
                String teamKey = (String) args[0];
                @SuppressWarnings("unchecked")
                Iterable<UUID> ids = (Iterable<UUID>) args[1];
                List<UUID> idList = new ArrayList<>();
                ids.forEach(idList::add);
                yield sprints.values().stream()
                    .filter(sprint -> teamKey.equals(sprint.getTeamKey()) && idList.contains(sprint.getId()))
                    .toList();
            }
            case "findByTeamKeyOrderByQuarterAndOrder" -> sprints.values().stream()
                .filter(sprint -> args[0].equals(sprint.getTeamKey()))
                .toList();
            case "findByIdAndTeamKey" -> {
                UUID id = (UUID) args[0];
                String teamKey = (String) args[1];
                SprintEntity sprint = sprints.get(id);
                yield sprint != null && teamKey.equals(sprint.getTeamKey()) ? Optional.of(sprint) : Optional.empty();
            }
            case "findByTeamKeyAndQuarterIdsOrderByQuarterAndOrder" -> List.of();
            case "findByTeamKeyAndQuarterIdOrderByOrderAsc" -> List.of();
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    private QuarterRepository quarterRepo() {
        return proxy(QuarterRepository.class, (method, args) -> switch (method.getName()) {
            case "findByIdAndTeamKey" -> {
                UUID id = (UUID) args[0];
                QuarterEntity quarter = quarters.get(id);
                yield quarter == null ? Optional.empty() : Optional.of(quarter);
            }
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    private ReleaseRepository releaseRepo() {
        return proxy(ReleaseRepository.class, (method, args) -> switch (method.getName()) {
            case "findByIdAndTeamKey" -> Optional.empty();
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    private TaskAllocationRepository taskAllocationRepo() {
        return proxy(TaskAllocationRepository.class, (method, args) -> switch (method.getName()) {
            case "aggregateWorkloadByParticipantAndSprint" -> List.of();
            default -> throw new UnsupportedOperationException(method.getName());
        });
    }

    @SuppressWarnings("unchecked")
    private <T> T proxy(Class<T> type, RepoHandler handler) {
        return (T) Proxy.newProxyInstance(
            type.getClassLoader(),
            new Class<?>[]{type},
            (proxy, method, args) -> {
                if ("toString".equals(method.getName())) {
                    return type.getSimpleName() + "Proxy";
                }
                if ("hashCode".equals(method.getName())) {
                    return System.identityHashCode(proxy);
                }
                if ("equals".equals(method.getName())) {
                    return proxy == args[0];
                }
                return handler.handle(method, args == null ? new Object[0] : args);
            }
        );
    }

    @FunctionalInterface
    private interface RepoHandler {
        Object handle(java.lang.reflect.Method method, Object[] args) throws Throwable;
    }

    private PlanningBacklogItemEntity planningItem(String id) {
        PlanningBacklogItemEntity entity = new PlanningBacklogItemEntity();
        entity.setId(UUID.fromString(id));
        entity.setTeamKey("team-a");
        entity.setTitle("Task");
        entity.setDescription("Desc");
        entity.setDod("DoD");
        entity.setPriority((short) 2);
        entity.setCustomers(new ArrayList<>(List.of("Customer")));
        entity.setStreams(new ArrayList<>(List.of("Core")));
        entity.setPlanningDemands(new ArrayList<>());
        entity.setPlanningQuarterIds(new ArrayList<>());
        entity.setPlanningSprintIds(new ArrayList<>());
        entity.setCreatedAt(LocalDate.of(2026, 1, 1));
        entity.setUpdatedAt(LocalDate.of(2026, 1, 1));
        entity.setDisplayOrder(1);
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd"));
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));
        quarter.setName("Q1");
        entity.setInitialQuarter(quarter);
        quarters.put(quarter.getId(), quarter);
        return entity;
    }

    private ParticipantEntity participant(String id, String fullName) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(UUID.fromString(id));
        entity.setTeamKey("team-a");
        entity.setFullName(fullName);
        entity.setRole("DEV");
        entity.setRate(new BigDecimal("1.0"));
        entity.setDisplayOrder(0);
        entity.setUserStreams(new LinkedHashSet<>(List.of("Core")));
        return entity;
    }

    private SprintEntity sprint(String id, String name) {
        SprintEntity sprint = new SprintEntity();
        sprint.setId(UUID.fromString(id));
        sprint.setName(name);
        sprint.setTeamKey("team-a");
        sprint.setStartDate(LocalDate.of(2026, 2, 2));
        sprint.setEndDate(LocalDate.of(2026, 2, 13));
        sprint.setWorkingDays(10);
        sprint.setOrder(1);
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"));
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));
        quarter.setName("Q1");
        sprint.setQuarter(quarter);
        quarters.put(quarter.getId(), quarter);
        return sprint;
    }

    private static final class CapturingPlanner implements PlanningSolverPort {
        private PlanningSolverInput lastInput;
        private PlanningSolverResult nextResult;

        @Override
        public PlannerType type() {
            return PlannerType.ALGORITHM;
        }

        @Override
        public PlanningSolverResult solve(PlanningSolverInput input) {
            this.lastInput = input;
            if (nextResult != null) {
                return nextResult;
            }
            return new PlanningSolverResult(
                PlannerType.ALGORITHM,
                Map.of(),
                List.of(),
                BigDecimal.ZERO,
                BigDecimal.ZERO
            );
        }
    }

    private static final class CapturingTaskService extends TaskService {
        private com.sber.isu.sprints_planning.dto.request.TaskCreateRequest lastCreateRequest;

        private CapturingTaskService() {
            super(null, null, null, null, null, null, null, null, null, null, null);
        }

        @Override
        public TaskDto create(String teamKey, com.sber.isu.sprints_planning.dto.request.TaskCreateRequest request) {
            this.lastCreateRequest = request;
            return new TaskDto(
                UUID.randomUUID().toString(),
                request.title(),
                request.description(),
                request.dod(),
                request.priority(),
                request.status(),
                request.customers() == null ? List.of() : request.customers(),
                request.streams() == null ? List.of() : request.streams(),
                request.participantIds() == null ? List.of() : request.participantIds(),
                request.planningQuarterIds() == null ? List.of() : request.planningQuarterIds(),
                request.planningSprintIds() == null ? List.of() : request.planningSprintIds(),
                request.loads() == null ? Map.of() : request.loads(),
                request.allocations() == null ? Map.of() : request.allocations(),
                Map.of(),
                Map.of(),
                null,
                request.releaseDateId(),
                request.initialQuarterId(),
                null,
                request.leaderId(),
                request.order(),
                "2026-01-01",
                "2026-01-01"
            );
        }
    }
}
