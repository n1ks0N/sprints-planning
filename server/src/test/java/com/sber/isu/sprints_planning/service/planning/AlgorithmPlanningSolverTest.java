package com.sber.isu.sprints_planning.service.planning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AlgorithmPlanningSolverTest {

    private AlgorithmPlanningSolver solver;

    @BeforeEach
    void setUp() {
        solver = new AlgorithmPlanningSolver();
    }

    @Test
    void keepsNextSpecificParticipantBlockedUntilPreviousActuallyFinishes() {
        ParticipantEntity p1 = participant("11111111-1111-1111-1111-111111111111", "BA 1", 1.0);
        ParticipantEntity p2 = participant("22222222-2222-2222-2222-222222222222", "SA 1", 1.0);
        SprintEntity s1 = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 10, 1);
        SprintEntity s2 = sprint("44444444-4444-4444-4444-444444444444", "Sprint 2", LocalDate.of(2026, 1, 26), 10, 2);

        Map<String, Map<String, BigDecimal>> committed = new LinkedHashMap<>();
        committed.put(p1.getId().toString(), Map.of(s1.getId().toString(), new BigDecimal("8.00")));

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(new PlanningDraftTask(
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "Task",
                (short) 1,
                10,
                "SPECIFIC_PARTICIPANTS",
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(p1.getId().toString(), p2.getId().toString()),
                List.of(s1.getId().toString(), s2.getId().toString())
            )),
            List.of(p1, p2),
            List.of(s1, s2),
            committed,
            1.0
        ));

        Map<String, Map<String, BigDecimal>> taskAllocations = result.taskAllocations().get("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assertThat(taskAllocations.get(p1.getId().toString())).containsEntry(s1.getId().toString(), new BigDecimal("2"));
        assertThat(taskAllocations.get(p1.getId().toString())).containsEntry(s2.getId().toString(), new BigDecimal("3"));
        assertThat(taskAllocations.get(p2.getId().toString())).doesNotContainKey(s1.getId().toString());
        assertThat(taskAllocations.get(p2.getId().toString())).containsEntry(s2.getId().toString(), new BigDecimal("5"));
    }

    @Test
    void stopsLaterSpecificParticipantsWhenEarlierQuotaCannotBeFullyPlaced() {
        ParticipantEntity p1 = participant("11111111-1111-1111-1111-111111111111", "BA 1", 1.0);
        ParticipantEntity p2 = participant("22222222-2222-2222-2222-222222222222", "SA 1", 1.0);
        SprintEntity s1 = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 2, 1);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(new PlanningDraftTask(
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "Task",
                (short) 1,
                6,
                "SPECIFIC_PARTICIPANTS",
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(p1.getId().toString(), p2.getId().toString()),
                List.of(s1.getId().toString())
            )),
            List.of(p1, p2),
            List.of(s1),
            Map.of(),
            1.0
        ));

        Map<String, Map<String, BigDecimal>> taskAllocations = result.taskAllocations().get("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assertThat(taskAllocations.get(p1.getId().toString())).containsEntry(s1.getId().toString(), new BigDecimal("2"));
        assertThat(taskAllocations).doesNotContainKey(p2.getId().toString());
        assertThat(result.unplannedDays()).isEqualByComparingTo("4");
    }

    @Test
    void prioritizesHigherPriorityTasksWhenSharedCapacityIsLimited() {
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1", 1.0, Set.of("Core"));
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 4, 1);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(
                new PlanningDraftTask(
                    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    "Can Wait",
                    (short) 3,
                    4,
                    "ROLE_STREAM",
                    "DEV",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint.getId().toString())
                ),
                new PlanningDraftTask(
                    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "Critical",
                    (short) 1,
                    4,
                    "ROLE_STREAM",
                    "DEV",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint.getId().toString())
                )
            ),
            List.of(participant),
            List.of(sprint),
            Map.of(),
            1.0
        ));

        assertThat(sumTaskDays(result, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).isEqualTo(4);
        assertThat(sumTaskDays(result, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).isEqualTo(0);
        assertThat(result.unplannedDays()).isEqualByComparingTo("4");
    }

    @Test
    void allowsPriorityOneAndTwoToExceedCapacityButKeepsPriorityThreeWithinFreeDays() {
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1", 0.5, Set.of("Core"));
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 4, 1);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(
                new PlanningDraftTask(
                    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "Must Fit",
                    (short) 1,
                    4,
                    "ROLE_STREAM",
                    "DEV",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint.getId().toString())
                ),
                new PlanningDraftTask(
                    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    "Only Free Capacity",
                    (short) 3,
                    4,
                    "ROLE_STREAM",
                    "DEV",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint.getId().toString())
                )
            ),
            List.of(participant),
            List.of(sprint),
            Map.of(),
            1.0
        ));

        assertThat(sumTaskDays(result, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).isEqualTo(4);
        assertThat(sumTaskDays(result, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).isLessThanOrEqualTo(2);
    }

    @Test
    void keepsNextDemandOfSameTaskFromEarlierSprint() {
        ParticipantEntity developer = participant("11111111-1111-1111-1111-111111111111", "Dev 1", 1.0, Set.of("Core"));
        ParticipantEntity tester = participant("22222222-2222-2222-2222-222222222222", "QA 1", 1.0, Set.of("Core"));
        tester.setRole("QA");
        SprintEntity sprint1 = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 4, 1);
        SprintEntity sprint2 = sprint("44444444-4444-4444-4444-444444444444", "Sprint 2", LocalDate.of(2026, 1, 26), 4, 2);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(
                new PlanningDraftTask(
                    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "Feature",
                    (short) 3,
                    1,
                    "ROLE_STREAM",
                    "DEV",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint2.getId().toString()),
                    0
                ),
                new PlanningDraftTask(
                    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    "Feature",
                    (short) 3,
                    1,
                    "ROLE_STREAM",
                    "QA",
                    "Core",
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(sprint1.getId().toString(), sprint2.getId().toString()),
                    1
                )
            ),
            List.of(developer, tester),
            List.of(sprint1, sprint2),
            Map.of(),
            1.0
        ));

        Map<String, Map<String, BigDecimal>> allocation = result.taskAllocations().get("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assertThat(allocation.getOrDefault(tester.getId().toString(), Map.of())).doesNotContainKey(sprint1.getId().toString());
    }

    @Test
    void prefersLessLoadedCandidateInsideSameRoleAndStreamPool() {
        ParticipantEntity busy = participant("11111111-1111-1111-1111-111111111111", "Busy Dev", 1.0, Set.of("Core"));
        ParticipantEntity free = participant("22222222-2222-2222-2222-222222222222", "Free Dev", 1.0, Set.of("Core"));
        free.setDisplayOrder(1);
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 5, 1);

        Map<String, Map<String, BigDecimal>> committed = new LinkedHashMap<>();
        committed.put(busy.getId().toString(), Map.of(sprint.getId().toString(), new BigDecimal("4")));

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(new PlanningDraftTask(
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "Task",
                (short) 2,
                3,
                "ROLE_STREAM",
                "DEV",
                "Core",
                null,
                null,
                null,
                null,
                List.of(),
                List.of(sprint.getId().toString())
            )),
            List.of(busy, free),
            List.of(sprint),
            committed,
            1.0
        ));

        Map<String, Map<String, BigDecimal>> taskAllocations = result.taskAllocations().get("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        assertThat(taskAllocations.getOrDefault(free.getId().toString(), Map.of()))
            .containsEntry(sprint.getId().toString(), new BigDecimal("3"));
        assertThat(taskAllocations.getOrDefault(busy.getId().toString(), Map.of()))
            .doesNotContainKey(sprint.getId().toString());
    }

    @Test
    void roleDemandWithoutStreamMatchesParticipantWithoutStreams() {
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1", 1.0, Set.of());
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 5, 1);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(new PlanningDraftTask(
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "Task",
                (short) 2,
                3,
                "ROLE_STREAM",
                "DEV",
                null,
                null,
                null,
                null,
                null,
                List.of(),
                List.of(sprint.getId().toString())
            )),
            List.of(participant),
            List.of(sprint),
            Map.of(),
            1.0
        ));

        assertThat(result.warnings()).noneMatch(warning -> warning.contains("по роли/стриму"));
        assertThat(sumTaskDays(result, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).isEqualTo(3);
    }

    @Test
    void roleDemandWithStreamStillRequiresMatchingParticipantStream() {
        ParticipantEntity participant = participant("11111111-1111-1111-1111-111111111111", "Dev 1", 1.0, Set.of());
        SprintEntity sprint = sprint("33333333-3333-3333-3333-333333333333", "Sprint 1", LocalDate.of(2026, 1, 12), 5, 1);

        PlanningSolverResult result = solver.solve(new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(new PlanningDraftTask(
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "Task",
                (short) 2,
                3,
                "ROLE_STREAM",
                "DEV",
                "Core",
                null,
                null,
                null,
                null,
                List.of(),
                List.of(sprint.getId().toString())
            )),
            List.of(participant),
            List.of(sprint),
            Map.of(),
            1.0
        ));

        assertThat(result.warnings()).anyMatch(warning -> warning.contains("по роли/стриму"));
        assertThat(sumTaskDays(result, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).isZero();
    }

    @Test
    void fallsBackToHeuristicOnlyWhenNativeLibrariesUnavailable() {
        PlanningSolverInput input = new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(),
            List.of(),
            List.of(),
            Map.of(),
            1.0
        );
        PlanningSolverResult heuristicResult = new PlanningSolverResult(
            PlannerType.ALGORITHM,
            Map.of(),
            List.of("heuristic"),
            BigDecimal.ZERO,
            BigDecimal.ZERO
        );
        NativeFailureSolver failingSolver = new NativeFailureSolver(heuristicResult);

        PlanningSolverResult result = failingSolver.solve(input);

        assertThat(failingSolver.fallbackUsed).isTrue();
        assertThat(result.warnings()).anyMatch(warning -> warning.contains("эвристический fallback"));
    }

    @Test
    void doesNotHideCpSatModelBugsBehindHeuristicFallback() {
        PlanningSolverInput input = new PlanningSolverInput(
            PlannerType.ALGORITHM,
            "team-a",
            List.of(),
            List.of(),
            List.of(),
            Map.of(),
            1.0
        );
        BrokenModelSolver solver = new BrokenModelSolver();

        assertThatThrownBy(() -> solver.solve(input))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("broken model");
        assertThat(solver.fallbackUsed).isFalse();
    }

    private ParticipantEntity participant(String id, String fullName, double rate) {
        return participant(id, fullName, rate, Set.of());
    }

    private ParticipantEntity participant(String id, String fullName, double rate, Set<String> streams) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(UUID.fromString(id));
        entity.setFullName(fullName);
        entity.setRole("DEV");
        entity.setRate(BigDecimal.valueOf(rate));
        entity.setDisplayOrder(0);
        entity.setTeamKey("team-a");
        entity.setUserStreams(new LinkedHashSet<>(streams));
        return entity;
    }

    private SprintEntity sprint(String id, String name, LocalDate startDate, int workingDays, int order) {
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));
        quarter.setName("Q1");
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));

        SprintEntity sprint = new SprintEntity();
        sprint.setId(UUID.fromString(id));
        sprint.setQuarter(quarter);
        sprint.setName(name);
        sprint.setStartDate(startDate);
        sprint.setEndDate(startDate.plusDays(11));
        sprint.setWorkingDays(workingDays);
        sprint.setOrder(order);
        sprint.setTeamKey("team-a");
        return sprint;
    }

    private int sumTaskDays(PlanningSolverResult result, String taskId) {
        return result.taskAllocations().getOrDefault(taskId, Map.of()).values().stream()
            .flatMap(row -> row.values().stream())
            .mapToInt(value -> value.intValue())
            .sum();
    }

    private static final class NativeFailureSolver extends AlgorithmPlanningSolver {

        private final PlanningSolverResult heuristicResult;
        private boolean fallbackUsed;

        private NativeFailureSolver(PlanningSolverResult heuristicResult) {
            this.heuristicResult = heuristicResult;
        }

        @Override
        protected void loadNativeLibraries() {
            throw new UnsatisfiedLinkError("native not available");
        }

        @Override
        protected PlanningSolverResult solveWithHeuristicInternal(PlanningSolverInput input) {
            fallbackUsed = true;
            return heuristicResult;
        }
    }

    private static final class BrokenModelSolver extends AlgorithmPlanningSolver {

        private boolean fallbackUsed;

        @Override
        protected void loadNativeLibraries() {
            // Pretend native layer is available so the test verifies solver-bug propagation.
        }

        @Override
        protected PlanningSolverResult solveWithCpSatInternal(PlanningSolverInput input) {
            throw new IllegalStateException("broken model");
        }

        @Override
        protected PlanningSolverResult solveWithHeuristicInternal(PlanningSolverInput input) {
            fallbackUsed = true;
            return new PlanningSolverResult(PlannerType.ALGORITHM, Map.of(), List.of(), BigDecimal.ZERO, BigDecimal.ZERO);
        }
    }
}
