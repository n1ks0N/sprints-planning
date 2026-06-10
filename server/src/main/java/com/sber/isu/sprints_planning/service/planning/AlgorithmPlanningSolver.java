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
        try {
            loadNativeLibraries();
        } catch (RuntimeException | LinkageError exception) {
            return appendWarning(
                solveWithHeuristicInternal(input),
                "CP-SAT solver недоступен, использован эвристический fallback: " + sanitizeWarning(exception.getMessage())
            );
        }
        try {
            return solveWithCpSatInternal(input);
        } catch (LinkageError exception) {
            return appendWarning(
                solveWithHeuristicInternal(input),
                "CP-SAT solver недоступен, использован эвристический fallback: " + sanitizeWarning(exception.getMessage())
            );
        }
    }

    protected void loadNativeLibraries() {
        ensureNativeLibrariesLoaded();
    }

    protected PlanningSolverResult solveWithCpSatInternal(PlanningSolverInput input) {
        return solveWithCpSat(input);
    }

    protected PlanningSolverResult solveWithHeuristicInternal(PlanningSolverInput input) {
        return solveWithHeuristic(input);
    }

    private PlanningSolverResult solveWithCpSat(PlanningSolverInput input) {
        Map<String, SprintEntity> sprintsById = input.sprints().stream()
            .collect(Collectors.toMap(sprint -> sprint.getId().toString(), sprint -> sprint, (left, right) -> left, LinkedHashMap::new));
        Map<String, ParticipantEntity> participantsById = input.participants().stream()
            .collect(Collectors.toMap(participant -> participant.getId().toString(), participant -> participant, (left, right) -> left,
                LinkedHashMap::new));

        List<String> warnings = new ArrayList<>();
        Map<String, Map<String, Map<String, BigDecimal>>> allocations = new LinkedHashMap<>();
        List<PreparedTask> preparedTasks = new ArrayList<>();
        int guaranteedUnplannedDays = 0;
        int totalRequestedDays = 0;
        Map<String, Integer> sprintChronologyIndex = buildSprintChronologyIndex(input.sprints());

        for (PlanningDraftTask task : orderTasksByPlanningPriority(input.tasks())) {
            allocations.computeIfAbsent(task.taskId(), ignored -> new LinkedHashMap<>());
            totalRequestedDays += Math.max(0, task.estimateDays());
            PreparedTask prepared = prepareTask(task, input, sprintsById, participantsById, warnings);
            if (prepared == null) {
                guaranteedUnplannedDays += Math.max(0, task.estimateDays());
                continue;
            }
            preparedTasks.add(prepared);
        }

        if (preparedTasks.isEmpty()) {
            return new PlanningSolverResult(
                type(),
                allocations,
                warnings,
                BigDecimal.ZERO,
                BigDecimal.valueOf(guaranteedUnplannedDays)
            );
        }

        CpModel model = new CpModel();
        LinearExprBuilder objective = LinearExpr.newBuilder();
        Map<String, Map<String, List<BoolVar>>> participantSprintAssignments = new LinkedHashMap<>();
        Map<String, Map<String, List<BoolVar>>> strictParticipantSprintAssignments = new LinkedHashMap<>();
        List<ModelTaskState> taskStates = new ArrayList<>();

        for (PreparedTask task : preparedTasks) {
            taskStates.add(buildTaskModel(model, task, objective, participantSprintAssignments, strictParticipantSprintAssignments,
                input.committedLoadByParticipantAndSprint(),
                participantsById,
                sprintChronologyIndex));
        }
        addDemandOrderConstraints(model, taskStates);

        long overloadUpperBound = Math.max(1, totalRequestedDays);
        for (ParticipantEntity participant : input.participants()) {
            String participantId = participant.getId().toString();
            for (SprintEntity sprint : input.sprints()) {
                List<BoolVar> assignments = participantSprintAssignments
                    .getOrDefault(participantId, Map.of())
                    .getOrDefault(sprint.getId().toString(), List.of());
                if (assignments.isEmpty()) {
                    continue;
                }
                int remainingCapacity = remainingCapacityWholeDays(participant, sprint, input.committedLoadByParticipantAndSprint(),
                    input.normFactor());
                List<BoolVar> strictAssignments = strictParticipantSprintAssignments
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
        int unplannedDays = guaranteedUnplannedDays;
        for (ModelTaskState taskState : taskStates) {
            Map<String, Map<String, BigDecimal>> taskAllocation = new LinkedHashMap<>();
            int taskPlannedDays = 0;
            for (ModelDay day : taskState.days()) {
                if (solver.booleanValue(day.unplanned())) {
                    continue;
                }
                boolean assigned = false;
                for (DayOption option : day.options()) {
                    if (!solver.booleanValue(option.literal())) {
                        continue;
                    }
                    taskAllocation.computeIfAbsent(option.participantId(), key -> new LinkedHashMap<>())
                        .merge(option.sprintId(), BigDecimal.ONE, BigDecimal::add);
                    taskPlannedDays += 1;
                    plannedDays += 1;
                    assigned = true;
                    break;
                }
                if (!assigned) {
                    unplannedDays += 1;
                }
            }
            int taskUnplannedDays = Math.max(0, taskState.task().task().estimateDays() - taskPlannedDays);
            unplannedDays += taskUnplannedDays;
            mergeTaskAllocation(allocations, taskState.task().task().taskId(), taskAllocation);
            if (taskUnplannedDays > 0) {
                warnings.add("Задача '" + taskState.task().task().title() + "' не распределена полностью: "
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

    private ModelTaskState buildTaskModel(
        CpModel model,
        PreparedTask preparedTask,
        LinearExprBuilder objective,
        Map<String, Map<String, List<BoolVar>>> participantSprintAssignments,
        Map<String, Map<String, List<BoolVar>>> strictParticipantSprintAssignments,
        Map<String, Map<String, BigDecimal>> committedLoadByParticipantAndSprint,
        Map<String, ParticipantEntity> participantsById,
        Map<String, Integer> sprintChronologyIndex
    ) {
        List<ModelDay> days = new ArrayList<>();
        Map<Integer, List<BoolVar>> slotUsage = new LinkedHashMap<>();
        Map<String, List<BoolVar>> sprintUsage = new LinkedHashMap<>();
        Map<String, List<BoolVar>> participantUsage = new LinkedHashMap<>();

        for (TaskSlot slot : preparedTask.slots()) {
            slotUsage.put(slot.index(), new ArrayList<>());
        }

        for (int dayIndex = 0; dayIndex < preparedTask.days().size(); dayIndex++) {
            PreparedDay day = preparedTask.days().get(dayIndex);
            BoolVar unplanned = model.newBoolVar(dayPrefix(preparedTask.task().taskId(), dayIndex) + "_unplanned");
            IntVar slotIndex = model.newIntVar(0, preparedTask.slots().size(),
                dayPrefix(preparedTask.task().taskId(), dayIndex) + "_slot");
            int unplannedSprintOrder = sprintChronologyIndex.size();
            IntVar sprintOrder = model.newIntVar(0, unplannedSprintOrder,
                dayPrefix(preparedTask.task().taskId(), dayIndex) + "_sprint_order");
            List<DayOption> options = new ArrayList<>();

            if (preparedTask.specificParticipants()) {
                String participantId = day.candidateParticipantIds().get(0);
                BoolVar[] slotChoices = new BoolVar[preparedTask.slots().size() + 1];
                LinearExprBuilder sprintOrderExpr = LinearExpr.newBuilder();
                for (TaskSlot slot : preparedTask.slots()) {
                    BoolVar choice = model.newBoolVar(dayPrefix(preparedTask.task().taskId(), dayIndex) + "_slot_" + slot.index());
                    slotChoices[slot.index()] = choice;
                    sprintOrderExpr.addTerm(choice, sprintChronologyIndex.getOrDefault(slot.sprintId(), unplannedSprintOrder));
                    options.add(new DayOption(choice, participantId, slot.sprintId(), slot.index()));
                    slotUsage.get(slot.index()).add(choice);
                    sprintUsage.computeIfAbsent(slot.sprintId(), key -> new ArrayList<>()).add(choice);
                    participantSprintAssignments
                        .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                        .computeIfAbsent(slot.sprintId(), key -> new ArrayList<>())
                        .add(choice);
                    if (!allowsOverload(preparedTask.task().priority())) {
                        strictParticipantSprintAssignments
                            .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                            .computeIfAbsent(slot.sprintId(), key -> new ArrayList<>())
                            .add(choice);
                    }
                    objective.addTerm(choice, assignmentCost(preparedTask.task(), slot, participantId,
                        committedLoadByParticipantAndSprint, participantsById, false));
                }
                slotChoices[preparedTask.slots().size()] = unplanned;
                sprintOrderExpr.addTerm(unplanned, unplannedSprintOrder);
                model.addExactlyOne(slotChoices);
                model.addMapDomain(slotIndex, slotChoices, 0);
                model.addEquality(sprintOrder, sprintOrderExpr.build());
            } else {
                BoolVar[] slotPresence = new BoolVar[preparedTask.slots().size() + 1];
                LinearExprBuilder sprintOrderExpr = LinearExpr.newBuilder();
                for (TaskSlot slot : preparedTask.slots()) {
                    BoolVar presentInSlot = model.newBoolVar(dayPrefix(preparedTask.task().taskId(), dayIndex) + "_slot_" + slot.index());
                    slotPresence[slot.index()] = presentInSlot;
                    sprintOrderExpr.addTerm(presentInSlot, sprintChronologyIndex.getOrDefault(slot.sprintId(), unplannedSprintOrder));
                    List<BoolVar> participantChoices = new ArrayList<>();
                    for (String participantId : day.candidateParticipantIds()) {
                        BoolVar choice = model.newBoolVar(dayPrefix(preparedTask.task().taskId(), dayIndex)
                            + "_p_" + sanitizeId(participantId) + "_slot_" + slot.index());
                        participantChoices.add(choice);
                        options.add(new DayOption(choice, participantId, slot.sprintId(), slot.index()));
                        slotUsage.get(slot.index()).add(choice);
                        sprintUsage.computeIfAbsent(slot.sprintId(), key -> new ArrayList<>()).add(choice);
                        participantUsage.computeIfAbsent(participantId, key -> new ArrayList<>()).add(choice);
                        participantSprintAssignments
                            .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                            .computeIfAbsent(slot.sprintId(), key -> new ArrayList<>())
                            .add(choice);
                        if (!allowsOverload(preparedTask.task().priority())) {
                            strictParticipantSprintAssignments
                                .computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                                .computeIfAbsent(slot.sprintId(), key -> new ArrayList<>())
                                .add(choice);
                        }
                        objective.addTerm(choice,
                            assignmentCost(preparedTask.task(), slot, participantId, committedLoadByParticipantAndSprint, participantsById,
                                true));
                    }
                    model.addEquality(LinearExpr.sum(participantChoices.toArray(LinearArgument[]::new)), presentInSlot);
                }
                slotPresence[preparedTask.slots().size()] = unplanned;
                sprintOrderExpr.addTerm(unplanned, unplannedSprintOrder);
                model.addExactlyOne(slotPresence);
                model.addMapDomain(slotIndex, slotPresence, 0);
                model.addEquality(sprintOrder, sprintOrderExpr.build());
            }

            objective.addTerm(unplanned, preparedTask.unplannedPenalty());
            days.add(new ModelDay(unplanned, slotIndex, sprintOrder, options));
        }

        for (List<BoolVar> slotAssignments : slotUsage.values()) {
            if (slotAssignments.size() > 1) {
                model.addAtMostOne(slotAssignments.toArray(BoolVar[]::new));
            }
        }

        for (int index = 0; index < days.size() - 1; index++) {
            model.addLessOrEqual(days.get(index).slotIndex(), days.get(index + 1).slotIndex());
        }

        addSprintFragmentationPenalty(model, objective, preparedTask, sprintUsage);
        if (!preparedTask.specificParticipants()) {
            addParticipantFragmentationPenalty(model, objective, preparedTask, participantUsage);
        }

        return new ModelTaskState(preparedTask, days);
    }

    private void addDemandOrderConstraints(CpModel model, List<ModelTaskState> taskStates) {
        Map<String, List<ModelTaskState>> byTaskId = taskStates.stream()
            .collect(Collectors.groupingBy(
                state -> state.task().task().taskId(),
                LinkedHashMap::new,
                Collectors.toCollection(ArrayList::new)
            ));
        byTaskId.values().forEach(states -> {
            states.sort(Comparator.comparingInt(state -> state.task().task().demandOrder()));
            for (int index = 0; index < states.size() - 1; index += 1) {
                ModelTaskState previous = states.get(index);
                ModelTaskState next = states.get(index + 1);
                if (previous.task().task().demandOrder() >= next.task().task().demandOrder()) {
                    continue;
                }
                for (ModelDay previousDay : previous.days()) {
                    for (ModelDay nextDay : next.days()) {
                        model.addLessOrEqual(previousDay.sprintOrder(), nextDay.sprintOrder());
                    }
                }
            }
        });
    }

    private void addSprintFragmentationPenalty(
        CpModel model,
        LinearExprBuilder objective,
        PreparedTask task,
        Map<String, List<BoolVar>> sprintUsage
    ) {
        for (Map.Entry<String, List<BoolVar>> entry : sprintUsage.entrySet()) {
            if (entry.getValue().isEmpty()) {
                continue;
            }
            BoolVar used = model.newBoolVar("task_" + sanitizeId(task.task().taskId()) + "_sprint_" + sanitizeId(entry.getKey()) + "_used");
            LinearExpr load = LinearExpr.sum(entry.getValue().toArray(LinearArgument[]::new));
            model.addGreaterOrEqual(load, used);
            model.addLessOrEqual(load, LinearExpr.term(used, task.days().size()));
            objective.addTerm(used, task.sprintFragmentPenalty());
        }
    }

    private void addParticipantFragmentationPenalty(
        CpModel model,
        LinearExprBuilder objective,
        PreparedTask task,
        Map<String, List<BoolVar>> participantUsage
    ) {
        for (Map.Entry<String, List<BoolVar>> entry : participantUsage.entrySet()) {
            if (entry.getValue().isEmpty()) {
                continue;
            }
            BoolVar used = model.newBoolVar(
                "task_" + sanitizeId(task.task().taskId()) + "_participant_" + sanitizeId(entry.getKey()) + "_used");
            LinearExpr load = LinearExpr.sum(entry.getValue().toArray(LinearArgument[]::new));
            model.addGreaterOrEqual(load, used);
            model.addLessOrEqual(load, LinearExpr.term(used, task.days().size()));
            objective.addTerm(used, task.participantFragmentPenalty());
        }
    }

    private PreparedTask prepareTask(
        PlanningDraftTask task,
        PlanningSolverInput input,
        Map<String, SprintEntity> sprintsById,
        Map<String, ParticipantEntity> participantsById,
        List<String> warnings
    ) {
        int estimateDays = Math.max(0, task.estimateDays());
        if (estimateDays <= 0) {
            return null;
        }

        List<SprintEntity> allowedSprints = task.allowedSprintIds().stream()
            .map(sprintsById::get)
            .filter(Objects::nonNull)
            .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
            .toList();
        if (allowedSprints.isEmpty()) {
            warnings.add("Задача '" + task.title() + "' не имеет доступных спринтов");
            return null;
        }

        List<TaskSlot> slots = buildTaskSlots(allowedSprints, task);
        if (slots.isEmpty()) {
            warnings.add("Задача '" + task.title() + "' не имеет доступных рабочих дней до релиза");
            return null;
        }

        List<PreparedDay> days = new ArrayList<>(estimateDays);
        boolean specific = ASSIGNMENT_MODE_SPECIFIC_PARTICIPANTS.equalsIgnoreCase(task.assignmentMode());
        if (specific) {
            List<String> orderedParticipants = task.orderedParticipantIds().stream()
                .filter(participantsById::containsKey)
                .toList();
            if (orderedParticipants.isEmpty()) {
                warnings.add("Задача '" + task.title() + "' не имеет доступных участников");
                return null;
            }
            int[] quotas = splitEvenly(estimateDays, orderedParticipants.size());
            for (int index = 0; index < orderedParticipants.size(); index++) {
                for (int day = 0; day < quotas[index]; day++) {
                    days.add(new PreparedDay(List.of(orderedParticipants.get(index))));
                }
            }
        } else {
            List<String> candidates = input.participants().stream()
                .filter(participant -> roleMatches(task.role(), participant.getRole()))
                .filter(participant -> streamMatches(task.stream(), participant.getUserStreams()))
                .map(participant -> participant.getId().toString())
                .toList();
            if (candidates.isEmpty()) {
                warnings.add("Задача '" + task.title() + "' не имеет доступных участников по роли/стриму");
                return null;
            }
            for (int day = 0; day < estimateDays; day++) {
                days.add(new PreparedDay(candidates));
            }
        }

        return new PreparedTask(
            task,
            slots,
            days,
            specific,
            unplannedPenalty(task.priority()),
            sprintFragmentPenalty(task.priority()),
            participantFragmentPenalty(task.priority())
        );
    }

    private List<TaskSlot> buildTaskSlots(List<SprintEntity> allowedSprints, PlanningDraftTask task) {
        List<TaskSlot> slots = new ArrayList<>();
        int absoluteIndex = 0;
        for (SprintEntity sprint : allowedSprints) {
            int availableDays = releaseWindowDays(sprint, task.releasePromDate());
            for (int dayIndex = 0; dayIndex < availableDays; dayIndex++) {
                slots.add(new TaskSlot(
                    absoluteIndex++,
                    sprint.getId().toString(),
                    approximateWorkingDate(sprint, dayIndex, availableDays)
                ));
            }
        }
        return slots;
    }

    private PlanningSolverResult appendWarning(PlanningSolverResult base, String warning) {
        List<String> warnings = new ArrayList<>(base.warnings());
        warnings.add(warning);
        return new PlanningSolverResult(base.plannerType(), base.taskAllocations(), warnings, base.plannedDays(), base.unplannedDays());
    }

    private synchronized void ensureNativeLibrariesLoaded() {
        if (!nativeLibrariesLoaded) {
            Loader.loadNativeLibraries();
            nativeLibrariesLoaded = true;
        }
    }

    private long assignmentCost(
        PlanningDraftTask task,
        TaskSlot slot,
        String participantId,
        Map<String, Map<String, BigDecimal>> committedLoadByParticipantAndSprint,
        Map<String, ParticipantEntity> participantsById,
        boolean applyCommittedLoadBias
    ) {
        int urgency = priorityUrgency(task.priority());
        long cost = (long) (slot.index() + 1) * baseSlotWeight(task.priority());
        LocalDate slotDate = slot.approximateDate();
        if (slotDate != null) {
            if (task.releaseRegressStart() != null && !slotDate.isBefore(task.releaseRegressStart())) {
                cost += REGRESS_START_PENALTY * urgency;
            } else if (task.releaseIftStart() != null && !slotDate.isBefore(task.releaseIftStart())) {
                cost += IFT_START_PENALTY * urgency;
            } else if (task.releaseDevEnd() != null && slotDate.isAfter(task.releaseDevEnd())) {
                cost += DEV_END_PENALTY * urgency;
            }
        }
        if (applyCommittedLoadBias) {
            cost += (long) getWholeDays(committedLoadByParticipantAndSprint, participantId, slot.sprintId()) * COMMITTED_LOAD_COST;
        }
        ParticipantEntity participant = participantsById.get(participantId);
        if (participant != null) {
            cost += Math.max(0, participant.getDisplayOrder());
        }
        return cost;
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

    private String sanitizeWarning(String message) {
        if (message == null || message.isBlank()) {
            return "неизвестная ошибка";
        }
        String normalized = message.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 200 ? normalized.substring(0, 200) : normalized;
    }

    private String sanitizeId(String raw) {
        return raw == null ? "unknown" : raw.replaceAll("[^A-Za-z0-9_]", "_");
    }

    private String dayPrefix(String taskId, int dayIndex) {
        return "task_" + sanitizeId(taskId) + "_day_" + dayIndex;
    }

    private PlanningSolverResult solveWithHeuristic(PlanningSolverInput input) {
        Map<String, SprintEntity> sprintsById = input.sprints().stream()
            .collect(Collectors.toMap(s -> s.getId().toString(), s -> s, (left, right) -> left, LinkedHashMap::new));
        Map<String, ParticipantEntity> participantsById = input.participants().stream()
            .collect(Collectors.toMap(p -> p.getId().toString(), p -> p));
        Map<String, Map<String, BigDecimal>> committed = deepCopy(input.committedLoadByParticipantAndSprint());
        Map<String, Map<String, BigDecimal>> draftLoad = new LinkedHashMap<>();
        Map<String, Map<String, Map<String, BigDecimal>>> allocations = new LinkedHashMap<>();
        List<String> warnings = new ArrayList<>();
        BigDecimal plannedDays = BigDecimal.ZERO;
        BigDecimal unplannedDays = BigDecimal.ZERO;
        Map<String, Integer> minDemandSprintIndexByTask = new LinkedHashMap<>();
        Map<String, Integer> sprintChronologyIndex = buildSprintChronologyIndex(input.sprints());

        List<PlanningDraftTask> tasks = orderTasksByPlanningPriority(input.tasks());

        for (PlanningDraftTask task : tasks) {
            int totalDays = Math.max(0, task.estimateDays());
            if (totalDays <= 0) {
                allocations.computeIfAbsent(task.taskId(), ignored -> new LinkedHashMap<>());
                continue;
            }
            List<SprintEntity> allowedSprints = task.allowedSprintIds().stream()
                .map(sprintsById::get)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
                .toList();
            Integer minDemandSprintIndex = minDemandSprintIndexByTask.get(task.taskId());
            if (minDemandSprintIndex != null) {
                allowedSprints = allowedSprints.stream()
                    .filter(sprint -> sprintChronologyIndex.getOrDefault(sprint.getId().toString(), Integer.MAX_VALUE) >= minDemandSprintIndex)
                    .toList();
            }
            if (allowedSprints.isEmpty()) {
                warnings.add("Задача '" + task.title() + "' не имеет доступных спринтов");
                allocations.computeIfAbsent(task.taskId(), ignored -> new LinkedHashMap<>());
                unplannedDays = unplannedDays.add(BigDecimal.valueOf(totalDays));
                minDemandSprintIndexByTask.put(task.taskId(), Integer.MAX_VALUE);
                continue;
            }

            Map<String, Map<String, BigDecimal>> taskAllocation;
            if (ASSIGNMENT_MODE_SPECIFIC_PARTICIPANTS.equalsIgnoreCase(task.assignmentMode())) {
                taskAllocation = allocateSequential(task, participantsById, allowedSprints, committed, draftLoad, input.normFactor());
            } else {
                taskAllocation = allocateByPool(task, participantsById, allowedSprints, committed, draftLoad, input.normFactor(),
                    input.participants());
            }
            mergeTaskAllocation(allocations, task.taskId(), taskAllocation);

            int taskPlanned = sumAllocationDays(taskAllocation);
            plannedDays = plannedDays.add(BigDecimal.valueOf(taskPlanned));
            int taskUnplanned = Math.max(0, totalDays - taskPlanned);
            int maxSprintIndex = maxAllocatedSprintIndex(taskAllocation, sprintChronologyIndex);
            if (taskUnplanned > 0 && taskPlanned == 0) {
                minDemandSprintIndexByTask.put(task.taskId(), Integer.MAX_VALUE);
            } else if (maxSprintIndex >= 0) {
                minDemandSprintIndexByTask.put(task.taskId(), maxSprintIndex);
            }
            if (taskUnplanned > 0) {
                warnings.add("Задача '" + task.title() + "' не распределена полностью: " + taskUnplanned + " дн.");
                unplannedDays = unplannedDays.add(BigDecimal.valueOf(taskUnplanned));
            }
        }

        return new PlanningSolverResult(type(), allocations, warnings, plannedDays, unplannedDays);
    }

    private Map<String, Map<String, BigDecimal>> allocateSequential(
        PlanningDraftTask task,
        Map<String, ParticipantEntity> participantsById,
        List<SprintEntity> allowedSprints,
        Map<String, Map<String, BigDecimal>> committed,
        Map<String, Map<String, BigDecimal>> draftLoad,
        double normFactor
    ) {
        List<String> orderedParticipants = task.orderedParticipantIds().stream()
            .filter(participantsById::containsKey)
            .toList();
        if (orderedParticipants.isEmpty()) {
            return Map.of();
        }

        int[] quotas = splitEvenly(task.estimateDays(), orderedParticipants.size());
        Map<String, Map<String, BigDecimal>> result = new LinkedHashMap<>();
        Map<String, Integer> sprintWindow = buildSprintWindows(allowedSprints, task.releasePromDate());
        int nextParticipantCursor = 0;

        for (int index = 0; index < orderedParticipants.size(); index++) {
            String participantId = orderedParticipants.get(index);
            ParticipantEntity participant = participantsById.get(participantId);
            if (participant == null) {
                continue;
            }
            int remaining = quotas[index];
            Map<String, BigDecimal> row = new LinkedHashMap<>();
            int participantCursor = nextParticipantCursor;
            int lastOccupiedCursor = nextParticipantCursor;
            int sprintStartOffset = 0;
            for (SprintEntity sprint : allowedSprints) {
                int sprintDays = sprintWindow.getOrDefault(sprint.getId().toString(), 0);
                if (remaining <= 0 || sprintDays <= 0) {
                    sprintStartOffset += sprintDays;
                    continue;
                }
                int relativeCursor = Math.max(0, participantCursor - sprintStartOffset);
                int sequenceRoom = Math.max(0, sprintDays - relativeCursor);
                int available = allowsOverload(task.priority())
                    ? sequenceRoom
                    : availableWholeDays(participant, sprint, committed, draftLoad, normFactor);
                int assign = Math.min(remaining, Math.min(sequenceRoom, available));
                if (assign > 0) {
                    row.put(sprint.getId().toString(), BigDecimal.valueOf(assign));
                    addLoad(draftLoad, participantId, sprint.getId().toString(), assign);
                    remaining -= assign;
                    participantCursor = sprintStartOffset + relativeCursor + assign;
                    lastOccupiedCursor = participantCursor;
                }
                sprintStartOffset += sprintDays;
            }
            if (!row.isEmpty()) {
                result.put(participantId, row);
            }
            if (remaining > 0) {
                break;
            }
            nextParticipantCursor = lastOccupiedCursor;
        }

        return result;
    }

    private Map<String, Map<String, BigDecimal>> allocateByPool(
        PlanningDraftTask task,
        Map<String, ParticipantEntity> participantsById,
        List<SprintEntity> allowedSprints,
        Map<String, Map<String, BigDecimal>> committed,
        Map<String, Map<String, BigDecimal>> draftLoad,
        double normFactor,
        List<ParticipantEntity> allParticipants
    ) {
        List<ParticipantEntity> candidates = allParticipants.stream()
            .filter(participant -> roleMatches(task.role(), participant.getRole()))
            .filter(participant -> streamMatches(task.stream(), participant.getUserStreams()))
            .toList();
        if (candidates.isEmpty()) {
            return Map.of();
        }

        List<SprintEntity> sprintOrder = orderSprintsByPriority(allowedSprints, task.priority());
        int remaining = task.estimateDays();
        Map<String, Map<String, BigDecimal>> result = new LinkedHashMap<>();

        for (SprintEntity sprint : sprintOrder) {
            if (remaining <= 0) {
                break;
            }
            int sprintWindow = releaseWindowDays(sprint, task.releasePromDate());
            if (sprintWindow <= 0) {
                continue;
            }
            int sprintRemaining = sprintWindow;
            List<ParticipantEntity> sortedCandidates = candidates.stream()
                .sorted(Comparator
                    .comparingInt((ParticipantEntity participant) -> availableWholeDays(participant, sprint, committed, draftLoad, normFactor))
                    .reversed()
                    .thenComparing(ParticipantEntity::getDisplayOrder))
                .toList();
            for (ParticipantEntity participant : sortedCandidates) {
                if (remaining <= 0 || sprintRemaining <= 0) {
                    break;
                }
                int available = allowsOverload(task.priority())
                    ? sprintRemaining
                    : Math.min(sprintRemaining, availableWholeDays(participant, sprint, committed, draftLoad, normFactor));
                if (available <= 0) {
                    continue;
                }
                int assign = Math.min(remaining, available);
                result.computeIfAbsent(participant.getId().toString(), key -> new LinkedHashMap<>())
                    .merge(sprint.getId().toString(), BigDecimal.valueOf(assign), BigDecimal::add);
                addLoad(draftLoad, participant.getId().toString(), sprint.getId().toString(), assign);
                remaining -= assign;
                sprintRemaining -= assign;
            }
        }

        return result;
    }

    private int availableWholeDays(
        ParticipantEntity participant,
        SprintEntity sprint,
        Map<String, Map<String, BigDecimal>> committed,
        Map<String, Map<String, BigDecimal>> draftLoad,
        double normFactor
    ) {
        BigDecimal rate = participant.getRate() == null ? BigDecimal.ZERO : participant.getRate();
        int capacity = BigDecimal.valueOf(sprint.getWorkingDays())
            .multiply(rate)
            .multiply(BigDecimal.valueOf(normFactor))
            .setScale(0, RoundingMode.DOWN)
            .intValue();
        int committedDays = getWholeDays(committed, participant.getId().toString(), sprint.getId().toString());
        int draftDays = getWholeDays(draftLoad, participant.getId().toString(), sprint.getId().toString());
        return Math.max(0, capacity - committedDays - draftDays);
    }

    private int getWholeDays(Map<String, Map<String, BigDecimal>> matrix, String participantId, String sprintId) {
        BigDecimal value = matrix.getOrDefault(participantId, Map.of()).get(sprintId);
        if (value == null) {
            return 0;
        }
        return value.setScale(0, RoundingMode.DOWN).intValue();
    }

    private void addLoad(Map<String, Map<String, BigDecimal>> matrix, String participantId, String sprintId, int days) {
        if (days <= 0) {
            return;
        }
        matrix.computeIfAbsent(participantId, key -> new LinkedHashMap<>())
            .merge(sprintId, BigDecimal.valueOf(days), BigDecimal::add);
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

    private List<SprintEntity> orderSprintsByPriority(List<SprintEntity> sprints, short priority) {
        List<SprintEntity> ordered = new ArrayList<>(sprints);
        ordered.sort(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder));
        if (priority <= 2) {
            return ordered;
        }
        if (ordered.size() <= 2) {
            return ordered;
        }
        int middleIndex = ordered.size() / 2;
        List<SprintEntity> result = new ArrayList<>();
        result.addAll(ordered.subList(middleIndex, ordered.size()));
        result.addAll(ordered.subList(0, middleIndex));
        return result;
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

    private int sumAllocationDays(Map<String, Map<String, BigDecimal>> taskAllocation) {
        return taskAllocation.values().stream()
            .flatMap(map -> map.values().stream())
            .map(value -> value.setScale(0, RoundingMode.DOWN).intValue())
            .reduce(0, Integer::sum);
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

    private int maxAllocatedSprintIndex(Map<String, Map<String, BigDecimal>> taskAllocation, Map<String, Integer> sprintChronologyIndex) {
        int max = -1;
        for (Map<String, BigDecimal> row : taskAllocation.values()) {
            for (Map.Entry<String, BigDecimal> entry : row.entrySet()) {
                if (entry.getValue() == null || entry.getValue().signum() <= 0) {
                    continue;
                }
                max = Math.max(max, sprintChronologyIndex.getOrDefault(entry.getKey(), Integer.MAX_VALUE));
            }
        }
        return max;
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

    private Map<String, Map<String, BigDecimal>> deepCopy(Map<String, Map<String, BigDecimal>> source) {
        Map<String, Map<String, BigDecimal>> result = new LinkedHashMap<>();
        if (source == null) {
            return result;
        }
        source.forEach((outerKey, inner) -> {
            Map<String, BigDecimal> nested = new LinkedHashMap<>();
            if (inner != null) {
                inner.forEach((innerKey, value) -> nested.put(innerKey, value == null ? BigDecimal.ZERO : value));
            }
            result.put(outerKey, nested);
        });
        return result;
    }

    private record PreparedTask(
        PlanningDraftTask task,
        List<TaskSlot> slots,
        List<PreparedDay> days,
        boolean specificParticipants,
        long unplannedPenalty,
        long sprintFragmentPenalty,
        long participantFragmentPenalty
    ) {
    }

    private record PreparedDay(List<String> candidateParticipantIds) {
    }

    private record TaskSlot(int index, String sprintId, LocalDate approximateDate) {
    }

    private record ModelTaskState(PreparedTask task, List<ModelDay> days) {
    }

    private record ModelDay(BoolVar unplanned, IntVar slotIndex, IntVar sprintOrder, List<DayOption> options) {
    }

    private record DayOption(BoolVar literal, String participantId, String sprintId, int slotIndex) {
    }
}
