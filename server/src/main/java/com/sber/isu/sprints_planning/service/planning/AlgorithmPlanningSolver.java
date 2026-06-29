package com.sber.isu.sprints_planning.service.planning;

import com.google.ortools.Loader;
import com.google.ortools.sat.BoolVar;
import com.google.ortools.sat.Constraint;
import com.google.ortools.sat.CpModel;
import com.google.ortools.sat.CpSolver;
import com.google.ortools.sat.CpSolverStatus;
import com.google.ortools.sat.IntVar;
import com.google.ortools.sat.LinearArgument;
import com.google.ortools.sat.LinearExpr;
import com.google.ortools.sat.LinearExprBuilder;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class AlgorithmPlanningSolver implements PlanningSolverPort {

    private static final String ASSIGNMENT_MODE_SPECIFIC_PARTICIPANTS = "SPECIFIC_PARTICIPANTS";
    private static final double MAX_SOLVE_SECONDS = 15.0d;
    private static final int MAX_SEARCH_WORKERS = 8;

    private static final long UNPLANNED_PRIORITY_1 = 3_000_000L;
    private static final long UNPLANNED_PRIORITY_2 = 2_000_000L;
    private static final long UNPLANNED_PRIORITY_3 = 900_000L;
    private static final long OVERLOAD_PENALTY = 1_200_000L;

    private static final long SLOT_COST_PRIORITY_1 = 180L;
    private static final long SLOT_COST_PRIORITY_2 = 70L;
    private static final long SLOT_COST_PRIORITY_3 = 25L;

    private static final long DEV_END_PENALTY = 2_500L;
    private static final long IFT_START_PENALTY = 10_000L;
    private static final long REGRESS_START_PENALTY = 40_000L;
    private static final long SPRINT_FRAGMENT_PENALTY = 500L;
    private static final long PARTICIPANT_FRAGMENT_PENALTY = 300L;
    private static final long COMMITTED_LOAD_COST = 300L;

    private static volatile boolean nativeLibrariesLoaded = false;

    @Override
    public PlannerType type() {
        return PlannerType.ALGORITHM;
    }

    @Override
    public PlanningSolverResult solve(PlanningSolverInput input) {
        loadNativeLibraries();
        return solveWithCpSatInternal(input);
    }

    protected void loadNativeLibraries() {
        ensureNativeLibrariesLoaded();
    }

    protected PlanningSolverResult solveWithCpSatInternal(PlanningSolverInput input) {
        return solveWithCpSat(input);
    }

    private PlanningSolverResult solveWithCpSat(PlanningSolverInput input) {
        Map<String, SprintEntity> sprintsById = input.sprints().stream()
            .collect(Collectors.toMap(sprint -> sprint.getId().toString(), sprint -> sprint, (left, right) -> left, LinkedHashMap::new));
        Map<String, ParticipantEntity> participantsById = input.participants().stream()
            .collect(Collectors.toMap(participant -> participant.getId().toString(), participant -> participant, (left, right) -> left,
                LinkedHashMap::new));

        List<String> warnings = new ArrayList<>();
        Map<String, Map<String, Map<String, BigDecimal>>> allocations = new LinkedHashMap<>();
        List<AggregatePart> parts = new ArrayList<>();
        int totalRequestedDays = 0;
        Map<String, Integer> sprintChronologyIndex = buildSprintChronologyIndex(input.sprints());

        for (PlanningDraftTask task : orderTasksByPlanningPriority(input.tasks())) {
            allocations.computeIfAbsent(task.taskId(), ignored -> new LinkedHashMap<>());
            totalRequestedDays += Math.max(0, task.estimateDays());
            parts.addAll(prepareAggregateParts(task, input, sprintsById, participantsById, warnings));
        }

        if (parts.isEmpty()) {
            int unplannedDays = input.tasks().stream()
                .mapToInt(task -> Math.max(0, task.estimateDays()))
                .sum();
            return new PlanningSolverResult(
                type(),
                allocations,
                warnings,
                BigDecimal.ZERO,
                BigDecimal.valueOf(unplannedDays)
            );
        }

        CpModel model = new CpModel();
        LinearExprBuilder objective = LinearExpr.newBuilder();
        Map<String, Map<String, List<IntVar>>> participantSprintAssignments = new LinkedHashMap<>();
        Map<String, Map<String, List<IntVar>>> strictParticipantSprintAssignments = new LinkedHashMap<>();
        List<AggregatePartState> partStates = new ArrayList<>();

        for (AggregatePart part : parts) {
            AggregatePartState state = buildAggregatePartModel(
                model,
                part,
                objective,
                participantSprintAssignments,
                strictParticipantSprintAssignments,
                input.committedLoadByParticipantAndSprint(),
                participantsById,
                sprintChronologyIndex
            );
            partStates.add(state);
        }
        addAggregateOrderConstraints(model, partStates, sprintChronologyIndex.size());

        long overloadUpperBound = Math.max(1, totalRequestedDays);
        for (ParticipantEntity participant : input.participants()) {
            String participantId = participant.getId().toString();
            for (SprintEntity sprint : input.sprints()) {
                List<IntVar> assignments = participantSprintAssignments
                    .getOrDefault(participantId, Map.of())
                    .getOrDefault(sprint.getId().toString(), List.of());
                if (assignments.isEmpty()) {
                    continue;
                }
                int remainingCapacity = remainingCapacityWholeDays(participant, sprint, input.committedLoadByParticipantAndSprint(),
                    input.normFactor());
                List<IntVar> strictAssignments = strictParticipantSprintAssignments
                    .getOrDefault(participantId, Map.of())
                    .getOrDefault(sprint.getId().toString(), List.of());
                if (!strictAssignments.isEmpty()) {
                    model.addLessOrEqual(
                        LinearExpr.sum(strictAssignments.toArray(LinearArgument[]::new)),
                        remainingCapacity
                    );
                }
                IntVar overload = model.newIntVar(0, overloadUpperBound,
                    "overload_" + sanitizeId(participantId) + "_" + sanitizeId(sprint.getId().toString()));
                LinearExpr loadExpr = LinearExpr.sum(assignments.toArray(LinearArgument[]::new));
                LinearExprBuilder capacityExpr = LinearExpr.newBuilder();
                capacityExpr.add(remainingCapacity);
                capacityExpr.add(overload);
                model.addLessOrEqual(loadExpr, capacityExpr.build());
                objective.addTerm(overload, OVERLOAD_PENALTY);
            }
        }

        model.minimize(objective.build());
        String validation = model.validate();
        if (validation != null && !validation.isBlank()) {
            throw new IllegalStateException("CP-SAT model is invalid: " + validation);
        }

        CpSolver solver = new CpSolver();
        solver.getParameters().setMaxTimeInSeconds(MAX_SOLVE_SECONDS);
        solver.getParameters().setNumSearchWorkers(Math.max(1, Math.min(MAX_SEARCH_WORKERS, Runtime.getRuntime().availableProcessors())));
        solver.getParameters().setRandomSeed(42);
        CpSolverStatus status = solver.solve(model);
        if (status != CpSolverStatus.OPTIMAL && status != CpSolverStatus.FEASIBLE) {
            throw new IllegalStateException("CP-SAT failed with status " + status);
        }
        if (status == CpSolverStatus.FEASIBLE) {
            warnings.add("CP-SAT нашел допустимое решение, но не доказал оптимальность в отведенное время");
        }

        int plannedDays = 0;
        int unplannedDays = 0;
        Map<String, Integer> unplannedByTask = new LinkedHashMap<>();
        for (AggregatePartState partState : partStates) {
            Map<String, Map<String, BigDecimal>> partAllocation = new LinkedHashMap<>();
            int partPlannedDays = 0;
            for (AggregateAssignment assignment : partState.assignments()) {
                long value = solver.value(assignment.days());
                if (value <= 0) {
                    continue;
                }
                int days = Math.toIntExact(value);
                partAllocation.computeIfAbsent(assignment.participantId(), key -> new LinkedHashMap<>())
                    .merge(assignment.sprintId(), BigDecimal.valueOf(days), BigDecimal::add);
                partPlannedDays += days;
            }
            int partUnplannedDays = Math.toIntExact(solver.value(partState.unplanned()));
            plannedDays += partPlannedDays;
            unplannedDays += partUnplannedDays;
            unplannedByTask.merge(partState.part().task().taskId(), partUnplannedDays, Integer::sum);
            mergeTaskAllocation(allocations, partState.part().task().taskId(), partAllocation);
        }
        for (PlanningDraftTask task : input.tasks()) {
            int taskUnplannedDays = unplannedByTask.getOrDefault(task.taskId(), 0);
            if (taskUnplannedDays > 0) {
                warnings.add("Задача '" + task.title() + "' не распределена полностью: "
                    + taskUnplannedDays + " дн.");
            }
        }

        return new PlanningSolverResult(
            type(),
            allocations,
            warnings,
            BigDecimal.valueOf(plannedDays),
            BigDecimal.valueOf(unplannedDays)
        );
    }

    private List<AggregatePart> prepareAggregateParts(
        PlanningDraftTask task,
        PlanningSolverInput input,
        Map<String, SprintEntity> sprintsById,
        Map<String, ParticipantEntity> participantsById,
        List<String> warnings
    ) {
        int estimateDays = Math.max(0, task.estimateDays());
        if (estimateDays <= 0) {
            return List.of();
        }

        List<SprintEntity> allowedSprints = task.allowedSprintIds().stream()
            .map(sprintsById::get)
            .filter(Objects::nonNull)
            .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
            .filter(sprint -> releaseWindowDays(sprint, task.releasePromDate()) > 0)
            .toList();
        if (allowedSprints.isEmpty()) {
            List<SprintEntity> knownSprints = task.allowedSprintIds().stream()
                .map(sprintsById::get)
                .filter(Objects::nonNull)
                .toList();
            warnings.add("Задача '" + task.title() + "' "
                + (knownSprints.isEmpty() ? "не имеет доступных спринтов" : "не имеет доступных рабочих дней до релиза"));
            return List.of();
        }

        boolean specific = ASSIGNMENT_MODE_SPECIFIC_PARTICIPANTS.equalsIgnoreCase(task.assignmentMode());
        if (specific) {
            List<String> orderedParticipants = task.orderedParticipantIds().stream()
                .filter(participantsById::containsKey)
                .toList();
            if (orderedParticipants.isEmpty()) {
                warnings.add("Задача '" + task.title() + "' не имеет доступных участников");
                return List.of();
            }
            int[] quotas = splitEvenly(estimateDays, orderedParticipants.size());
            List<AggregatePart> parts = new ArrayList<>();
            for (int index = 0; index < orderedParticipants.size(); index++) {
                if (quotas[index] <= 0) {
                    continue;
                }
                parts.add(new AggregatePart(
                    task,
                    task.taskId() + ":" + task.demandOrder() + ":" + index,
                    quotas[index],
                    List.of(orderedParticipants.get(index)),
                    allowedSprints,
                    true,
                    task.demandOrder(),
                    index
                ));
            }
            return parts;
        }

        List<String> candidates = input.participants().stream()
            .filter(participant -> roleMatches(task.role(), participant.getRole()))
            .filter(participant -> streamMatches(task.stream(), participant.getUserStreams()))
            .map(participant -> participant.getId().toString())
            .toList();
        if (candidates.isEmpty()) {
            warnings.add("Задача '" + task.title() + "' не имеет доступных участников по роли/стриму");
            return List.of();
        }
        return List.of(new AggregatePart(
            task,
            task.taskId() + ":" + task.demandOrder(),
            estimateDays,
            candidates,
            allowedSprints,
            false,
            task.demandOrder(),
            0
        ));
    }

    private AggregatePartState buildAggregatePartModel(
        CpModel model,
        AggregatePart part,
        LinearExprBuilder objective,
        Map<String, Map<String, List<IntVar>>> participantSprintAssignments,
        Map<String, Map<String, List<IntVar>>> strictParticipantSprintAssignments,
        Map<String, Map<String, BigDecimal>> committedLoadByParticipantAndSprint,
        Map<String, ParticipantEntity> participantsById,
        Map<String, Integer> sprintChronologyIndex
    ) {
        List<AggregateAssignment> assignments = new ArrayList<>();
        Map<String, List<IntVar>> sprintLoads = new LinkedHashMap<>();
        Map<String, List<IntVar>> participantLoads = new LinkedHashMap<>();
        int sprintCount = sprintChronologyIndex.size();
        IntVar unplanned = model.newIntVar(0, part.requiredDays(), aggregatePrefix(part) + "_unplanned");
        BoolVar unplannedUsed = model.newBoolVar(aggregatePrefix(part) + "_unplanned_used");
        model.addLessOrEqual(unplanned, LinearExpr.term(unplannedUsed, part.requiredDays()));
        model.addGreaterOrEqual(unplanned, unplannedUsed);
        LinearExprBuilder requiredExpr = LinearExpr.newBuilder();
        requiredExpr.add(unplanned);
        List<BoolVar> usedForOrder = new ArrayList<>();
        List<Integer> orderForUsed = new ArrayList<>();
        usedForOrder.add(unplannedUsed);
        orderForUsed.add(sprintCount);

        Map<String, Integer> sprintWindows = buildSprintWindows(part.allowedSprints(), part.task().releasePromDate());
        for (SprintEntity sprint : part.allowedSprints()) {
            String sprintId = sprint.getId().toString();
            int sprintWindow = sprintWindows.getOrDefault(sprintId, 0);
            if (sprintWindow <= 0) {
                continue;
            }
            List<IntVar> partSprintLoads = new ArrayList<>();
            for (String participantId : part.candidateParticipantIds()) {
                IntVar days = model.newIntVar(0, Math.min(part.requiredDays(), sprintWindow),
                    aggregatePrefix(part) + "_p_" + sanitizeId(participantId) + "_s_" + sanitizeId(sprintId));
                assignments.add(new AggregateAssignment(days, participantId, sprintId));
                requiredExpr.add(days);
                partSprintLoads.add(days);
                sprintLoads.computeIfAbsent(sprintId, key -> new ArrayList<>()).add(days);
                participantLoads.computeIfAbsent(participantId, key -> new ArrayList<>()).add(days);
                participantSprintAssignments
                    .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                    .computeIfAbsent(sprintId, key -> new ArrayList<>())
                    .add(days);
                if (!allowsOverload(part.task().priority())) {
                    strictParticipantSprintAssignments
                        .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                        .computeIfAbsent(sprintId, key -> new ArrayList<>())
                        .add(days);
                }
                objective.addTerm(days, aggregateAssignmentCost(
                    part.task(),
                    sprint,
                    participantId,
                    committedLoadByParticipantAndSprint,
                    participantsById,
                    sprintChronologyIndex,
                    !part.specificParticipants()
                ));
            }
            if (!partSprintLoads.isEmpty()) {
                model.addLessOrEqual(LinearExpr.sum(partSprintLoads.toArray(LinearArgument[]::new)), sprintWindow);
            }
        }
        model.addEquality(requiredExpr.build(), part.requiredDays());

        List<AggregateUsedSprint> usedSprints = new ArrayList<>();
        sprintLoads.forEach((sprintId, loads) -> {
            BoolVar used = model.newBoolVar(aggregatePrefix(part) + "_sprint_" + sanitizeId(sprintId) + "_used");
            LinearExpr load = LinearExpr.sum(loads.toArray(LinearArgument[]::new));
            model.addGreaterOrEqual(load, used);
            model.addLessOrEqual(load, LinearExpr.term(used, part.requiredDays()));
            objective.addTerm(used, sprintFragmentPenalty(part.task().priority()));
            usedSprints.add(new AggregateUsedSprint(sprintId, used));
            usedForOrder.add(used);
            orderForUsed.add(sprintChronologyIndex.getOrDefault(sprintId, sprintCount));
        });

        if (!part.specificParticipants()) {
            participantLoads.forEach((participantId, loads) -> {
                BoolVar used = model.newBoolVar(aggregatePrefix(part) + "_participant_" + sanitizeId(participantId) + "_used");
                LinearExpr load = LinearExpr.sum(loads.toArray(LinearArgument[]::new));
                model.addGreaterOrEqual(load, used);
                model.addLessOrEqual(load, LinearExpr.term(used, part.requiredDays()));
                objective.addTerm(used, participantFragmentPenalty(part.task().priority()));
            });
        }

        objective.addTerm(unplanned, unplannedPenalty(part.task().priority()));
        return new AggregatePartState(part, assignments, usedSprints, unplanned, unplannedUsed, usedForOrder, orderForUsed);
    }

    private void addAggregateOrderConstraints(
        CpModel model,
        List<AggregatePartState> partStates,
        int unplannedOrder
    ) {
        Map<String, List<AggregatePartState>> byTaskId = partStates.stream()
            .collect(Collectors.groupingBy(
                state -> state.part().task().taskId(),
                LinkedHashMap::new,
                Collectors.toCollection(ArrayList::new)
            ));
        byTaskId.values().forEach(states -> {
            states.sort(Comparator
                .comparingInt((AggregatePartState state) -> state.part().demandOrder())
                .thenComparingInt(state -> state.part().sequenceOrder()));
            for (int leftIndex = 0; leftIndex < states.size() - 1; leftIndex += 1) {
                AggregatePartState previous = states.get(leftIndex);
                for (int rightIndex = leftIndex + 1; rightIndex < states.size(); rightIndex += 1) {
                    AggregatePartState next = states.get(rightIndex);
                    if (previous.part().demandOrder() == next.part().demandOrder()
                        && previous.part().sequenceOrder() >= next.part().sequenceOrder()) {
                        continue;
                    }
                    addAggregatePartBeforeConstraint(model, previous, next, unplannedOrder);
                }
            }
        });
    }

    private void addAggregatePartBeforeConstraint(
        CpModel model,
        AggregatePartState previous,
        AggregatePartState next,
        int unplannedOrder
    ) {
        for (int left = 0; left < previous.usedForOrder().size(); left += 1) {
            int previousOrder = previous.orderForUsed().get(left);
            BoolVar previousUsed = previous.usedForOrder().get(left);
            for (int right = 0; right < next.usedForOrder().size(); right += 1) {
                int nextOrder = next.orderForUsed().get(right);
                if (previousOrder <= nextOrder) {
                    continue;
                }
                BoolVar nextUsed = next.usedForOrder().get(right);
                model.addLessOrEqual(LinearExpr.sum(new LinearArgument[] { previousUsed, nextUsed }), 1);
            }
            if (previousOrder == unplannedOrder) {
                for (int right = 0; right < next.usedForOrder().size(); right += 1) {
                    if (next.orderForUsed().get(right) < unplannedOrder) {
                        model.addLessOrEqual(LinearExpr.sum(new LinearArgument[] {
                            previousUsed,
                            next.usedForOrder().get(right)
                        }), 1);
                    }
                }
            }
        }
    }

    private long aggregateAssignmentCost(
        PlanningDraftTask task,
        SprintEntity sprint,
        String participantId,
        Map<String, Map<String, BigDecimal>> committedLoadByParticipantAndSprint,
        Map<String, ParticipantEntity> participantsById,
        Map<String, Integer> sprintChronologyIndex,
        boolean applyCommittedLoadBias
    ) {
        int urgency = priorityUrgency(task.priority());
        int sprintOrder = sprintChronologyIndex.getOrDefault(sprint.getId().toString(), 0);
        long cost = (long) (sprintOrder + 1) * Math.max(1, sprint.getWorkingDays()) * baseSlotWeight(task.priority());
        LocalDate representativeDate = approximateWorkingDate(sprint, 0, Math.max(1, releaseWindowDays(sprint, task.releasePromDate())));
        if (representativeDate != null) {
            if (task.releaseRegressStart() != null && !representativeDate.isBefore(task.releaseRegressStart())) {
                cost += REGRESS_START_PENALTY * urgency;
            } else if (task.releaseIftStart() != null && !representativeDate.isBefore(task.releaseIftStart())) {
                cost += IFT_START_PENALTY * urgency;
            } else if (task.releaseDevEnd() != null && representativeDate.isAfter(task.releaseDevEnd())) {
                cost += DEV_END_PENALTY * urgency;
            }
        }
        if (applyCommittedLoadBias) {
            cost += (long) getWholeDays(committedLoadByParticipantAndSprint, participantId, sprint.getId().toString())
                * COMMITTED_LOAD_COST;
        }
        ParticipantEntity participant = participantsById.get(participantId);
        if (participant != null) {
            cost += Math.max(0, participant.getDisplayOrder());
        }
        return cost;
    }

    private String aggregatePrefix(AggregatePart part) {
        return "part_" + sanitizeId(part.partKey());
    }

    private synchronized void ensureNativeLibrariesLoaded() {
        if (!nativeLibrariesLoaded) {
            Loader.loadNativeLibraries();
            nativeLibrariesLoaded = true;
        }
    }

    private int priorityUrgency(short priority) {
        if (priority <= 1) {
            return 3;
        }
        if (priority == 2) {
            return 2;
        }
        return 1;
    }

    private long unplannedPenalty(short priority) {
        return switch (priorityUrgency(priority)) {
            case 3 -> UNPLANNED_PRIORITY_1;
            case 2 -> UNPLANNED_PRIORITY_2;
            default -> UNPLANNED_PRIORITY_3;
        };
    }

    private long baseSlotWeight(short priority) {
        return switch (priorityUrgency(priority)) {
            case 3 -> SLOT_COST_PRIORITY_1;
            case 2 -> SLOT_COST_PRIORITY_2;
            default -> SLOT_COST_PRIORITY_3;
        };
    }

    private boolean allowsOverload(short priority) {
        return priority <= 2;
    }

    private long sprintFragmentPenalty(short priority) {
        return SPRINT_FRAGMENT_PENALTY * priorityUrgency(priority);
    }

    private long participantFragmentPenalty(short priority) {
        return PARTICIPANT_FRAGMENT_PENALTY * priorityUrgency(priority);
    }

    private int remainingCapacityWholeDays(
        ParticipantEntity participant,
        SprintEntity sprint,
        Map<String, Map<String, BigDecimal>> committed,
        double normFactor
    ) {
        BigDecimal rate = participant.getRate() == null ? BigDecimal.ZERO : participant.getRate();
        int capacity = BigDecimal.valueOf(sprint.getWorkingDays())
            .multiply(rate)
            .multiply(BigDecimal.valueOf(normFactor))
            .setScale(0, RoundingMode.DOWN)
            .intValue();
        int committedDays = getWholeDays(committed, participant.getId().toString(), sprint.getId().toString());
        return Math.max(0, capacity - committedDays);
    }

    private LocalDate approximateWorkingDate(SprintEntity sprint, int dayIndex, int availableDays) {
        if (sprint.getStartDate() == null) {
            return null;
        }
        if (sprint.getEndDate() == null || availableDays <= 1) {
            return sprint.getStartDate();
        }
        long totalCalendarDays = ChronoUnit.DAYS.between(sprint.getStartDate(), sprint.getEndDate()) + 1;
        if (totalCalendarDays <= 1) {
            return sprint.getStartDate();
        }
        double ratio = (double) dayIndex / (double) Math.max(1, availableDays - 1);
        long offset = Math.min(totalCalendarDays - 1, Math.round(ratio * (double) (totalCalendarDays - 1)));
        return sprint.getStartDate().plusDays(offset);
    }

    private String sanitizeId(String raw) {
        return raw == null ? "unknown" : raw.replaceAll("[^A-Za-z0-9_]", "_");
    }

    private int getWholeDays(Map<String, Map<String, BigDecimal>> matrix, String participantId, String sprintId) {
        BigDecimal value = matrix.getOrDefault(participantId, Map.of()).get(sprintId);
        if (value == null) {
            return 0;
        }
        return value.setScale(0, RoundingMode.DOWN).intValue();
    }

    private int[] splitEvenly(int totalDays, int buckets) {
        int[] result = new int[buckets];
        if (buckets <= 0) {
            return result;
        }
        int base = totalDays / buckets;
        int remainder = totalDays % buckets;
        for (int index = 0; index < buckets; index++) {
            result[index] = base + (index < remainder ? 1 : 0);
        }
        return result;
    }

    private Map<String, Integer> buildSprintWindows(List<SprintEntity> allowedSprints, LocalDate releasePromDate) {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (SprintEntity sprint : allowedSprints) {
            result.put(sprint.getId().toString(), releaseWindowDays(sprint, releasePromDate));
        }
        return result;
    }

    private int releaseWindowDays(SprintEntity sprint, LocalDate releasePromDate) {
        if (releasePromDate == null) {
            return Math.max(0, sprint.getWorkingDays());
        }
        if (sprint.getStartDate() != null && sprint.getStartDate().isAfter(releasePromDate)) {
            return 0;
        }
        if (sprint.getEndDate() != null && !sprint.getEndDate().isAfter(releasePromDate)) {
            return Math.max(0, sprint.getWorkingDays());
        }
        if (sprint.getStartDate() == null || sprint.getEndDate() == null) {
            return Math.max(0, sprint.getWorkingDays());
        }
        long totalCalendarDays = ChronoUnit.DAYS.between(sprint.getStartDate(), sprint.getEndDate()) + 1;
        long allowedCalendarDays = ChronoUnit.DAYS.between(sprint.getStartDate(), releasePromDate) + 1;
        if (totalCalendarDays <= 0 || allowedCalendarDays <= 0) {
            return 0;
        }
        double ratio = Math.min(1.0d, Math.max(0.0d, (double) allowedCalendarDays / (double) totalCalendarDays));
        return BigDecimal.valueOf(sprint.getWorkingDays())
            .multiply(BigDecimal.valueOf(ratio))
            .setScale(0, RoundingMode.DOWN)
            .intValue();
    }

    private boolean roleMatches(String requiredRole, String actualRole) {
        if (requiredRole == null || requiredRole.isBlank()) {
            return true;
        }
        if (actualRole == null || actualRole.isBlank()) {
            return false;
        }
        return requiredRole.trim().equalsIgnoreCase(actualRole.trim());
    }

    private boolean streamMatches(String requiredStream, Collection<String> streams) {
        if (requiredStream == null || requiredStream.isBlank()) {
            return true;
        }
        if (streams == null || streams.isEmpty()) {
            return false;
        }
        return streams.stream().filter(Objects::nonNull).anyMatch(value -> requiredStream.trim().equalsIgnoreCase(value.trim()));
    }

    private List<PlanningDraftTask> orderTasksByPlanningPriority(List<PlanningDraftTask> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return List.of();
        }
        return tasks.stream()
            .sorted(Comparator
                .comparingInt((PlanningDraftTask task) -> planningPriorityGroup(task.priority()))
                .thenComparingInt(PlanningDraftTask::priority)
                .thenComparing(task -> task.releasePromDate() == null ? LocalDate.MAX : task.releasePromDate())
                .thenComparing(PlanningDraftTask::taskId)
                .thenComparingInt(PlanningDraftTask::demandOrder)
                .thenComparing(PlanningDraftTask::estimateDays, Comparator.reverseOrder())
            )
            .toList();
    }

    private int planningPriorityGroup(short priority) {
        return priority <= 2 ? 0 : 1;
    }

    private Map<String, Integer> buildSprintChronologyIndex(List<SprintEntity> sprints) {
        List<SprintEntity> ordered = sprints.stream()
            .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
            .toList();
        Map<String, Integer> result = new LinkedHashMap<>();
        for (int index = 0; index < ordered.size(); index += 1) {
            result.put(ordered.get(index).getId().toString(), index);
        }
        return result;
    }

    private void mergeTaskAllocation(
        Map<String, Map<String, Map<String, BigDecimal>>> allocations,
        String taskId,
        Map<String, Map<String, BigDecimal>> nextAllocation
    ) {
        Map<String, Map<String, BigDecimal>> existing = allocations.computeIfAbsent(taskId, ignored -> new LinkedHashMap<>());
        nextAllocation.forEach((participantId, sprintRows) -> {
            Map<String, BigDecimal> existingSprints = existing.computeIfAbsent(participantId, ignored -> new LinkedHashMap<>());
            sprintRows.forEach((sprintId, days) -> existingSprints.merge(sprintId, days, BigDecimal::add));
        });
    }

    private record AggregatePart(
        PlanningDraftTask task,
        String partKey,
        int requiredDays,
        List<String> candidateParticipantIds,
        List<SprintEntity> allowedSprints,
        boolean specificParticipants,
        int demandOrder,
        int sequenceOrder
    ) {
    }

    private record AggregateAssignment(IntVar days, String participantId, String sprintId) {
    }

    private record AggregateUsedSprint(String sprintId, BoolVar used) {
    }

    private record AggregatePartState(
        AggregatePart part,
        List<AggregateAssignment> assignments,
        List<AggregateUsedSprint> usedSprints,
        IntVar unplanned,
        BoolVar unplannedUsed,
        List<BoolVar> usedForOrder,
        List<Integer> orderForUsed
    ) {
    }
}
