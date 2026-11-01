package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.config.CapacityProperties;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionParticipantLoadCellDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionParticipantLoadRowDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionSolveSummaryDto;
import com.sber.isu.sprints_planning.dto.PlanningWorkbenchItemDto;
import com.sber.isu.sprints_planning.dto.PlanningWorkbenchPreviewDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskPlanningDemandDto;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyItemPatchRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchItemRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchPreviewRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskPlanningDemandRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.PlanningBacklogItemEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskPlanningDemandValue;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.PlanningBacklogItemRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.WorkloadAggregation;
import com.sber.isu.sprints_planning.service.planning.PlanningDraftTask;
import com.sber.isu.sprints_planning.service.planning.PlannerType;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverInput;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverPort;
import com.sber.isu.sprints_planning.service.planning.PlanningSolverResult;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlanningWorkbenchService {

    private final PlanningBacklogItemRepository planningBacklogItemRepository;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final QuarterRepository quarterRepository;
    private final ReleaseRepository releaseRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final TaskService taskService;
    private com.sber.isu.sprints_planning.repository.TaskRepository taskRepository;
    private ReleaseService releaseService;
    private com.sber.isu.sprints_planning.repository.PlanningBacklogPageRepository pageRepository;

    @org.springframework.beans.factory.annotation.Autowired
    public void configureBacklogIntegration(com.sber.isu.sprints_planning.repository.TaskRepository taskRepository,
        ReleaseService releaseService, com.sber.isu.sprints_planning.repository.PlanningBacklogPageRepository pageRepository) {
        this.taskRepository = taskRepository;
        this.releaseService = releaseService;
        this.pageRepository = pageRepository;
    }

    private final CapacityProperties capacityProperties;
    private final Map<PlannerType, PlanningSolverPort> plannersByType;

    public PlanningWorkbenchService(
        PlanningBacklogItemRepository planningBacklogItemRepository,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        QuarterRepository quarterRepository,
        ReleaseRepository releaseRepository,
        TaskAllocationRepository taskAllocationRepository,
        TaskService taskService,
        CapacityProperties capacityProperties,
        List<PlanningSolverPort> planners
    ) {
        this.planningBacklogItemRepository = planningBacklogItemRepository;
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.quarterRepository = quarterRepository;
        this.releaseRepository = releaseRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.taskService = taskService;
        this.capacityProperties = capacityProperties;
        this.plannersByType = planners.stream().collect(Collectors.toMap(PlanningSolverPort::type, Function.identity()));
    }

    @Transactional(readOnly = true)
    public List<PlanningWorkbenchItemDto> getBacklogCandidates(String teamKey) {
        return getBacklogCandidates(teamKey, null, null);
    }

    @Transactional(readOnly = true)
    public List<PlanningWorkbenchItemDto> getBacklogCandidates(String teamKey, String sortBy, String sortDirection) {
        return planningBacklogItemRepository.findAllByTeamKeyOrderByDisplayOrderAscCreatedAtAsc(teamKey).stream()
            .sorted(planningItemComparator(teamKey, sortBy, sortDirection))
            .map(item -> toPlanningItemDto(item, Map.of()))
            .toList();
    }

    @Transactional(readOnly = true)
    public Page<PlanningWorkbenchItemDto> getBacklogCandidatesPage(
        String teamKey,
        String sortBy,
        String sortDirection,
        Integer page,
        Integer size,
        List<String> quarterIds,
        String priority,
        String releaseDateId,
        List<String> streams,
        List<String> customers,
        String search,
        Boolean withoutStream,
        Boolean withoutCustomer
    ) {
        int safePage = page == null ? 0 : Math.max(0, page);
        int safeSize = size == null ? 20 : Math.min(Math.max(1, size), 200);
        Pageable pageable = Pageable.ofSize(safeSize).withPage(safePage);
        if (pageRepository != null) {
            var ids = pageRepository.findPage(teamKey, sortBy, sortDirection, safePage, safeSize, quarterIds, priority,
                releaseDateId, streams, customers, search, withoutStream, withoutCustomer);
            var byId = planningBacklogItemRepository.findAllWithDetailsByTeamKeyAndIdIn(teamKey, ids.getContent()).stream()
                .collect(Collectors.toMap(PlanningBacklogItemEntity::getId, Function.identity()));
            return new PageImpl<>(ids.getContent().stream().map(byId::get).filter(Objects::nonNull)
                .map(item -> toPlanningItemDto(item, Map.of())).toList(), pageable, ids.getTotalElements());
        }

        List<PlanningBacklogItemEntity> filtered = planningBacklogItemRepository.findAllByTeamKeyOrderByDisplayOrderAscCreatedAtAsc(teamKey)
            .stream()
            .filter(item -> planningItemMatchesFilters(
                teamKey,
                item,
                quarterIds,
                priority,
                releaseDateId,
                streams,
                customers,
                search,
                withoutStream,
                withoutCustomer
            ))
            .sorted(planningItemComparator(teamKey, sortBy, sortDirection))
            .toList();

        int fromIndex = Math.min(safePage * safeSize, filtered.size());
        int toIndex = Math.min(fromIndex + safeSize, filtered.size());
        List<PlanningWorkbenchItemDto> content = filtered.subList(fromIndex, toIndex).stream()
            .map(item -> toPlanningItemDto(item, Map.of()))
            .toList();
        return new PageImpl<>(content, pageable, filtered.size());
    }

    private boolean planningItemMatchesFilters(
        String teamKey,
        PlanningBacklogItemEntity item,
        List<String> quarterIds,
        String priority,
        String releaseDateId,
        List<String> streams,
        List<String> customers,
        String search,
        Boolean withoutStream,
        Boolean withoutCustomer
    ) {
        Set<String> selectedPriorities = splitFilterValues(priority);
        if (!selectedPriorities.isEmpty() && !selectedPriorities.contains(String.valueOf(item.getPriority()))) {
            return false;
        }

        String normalizedReleaseDateId = normalizeOptional(releaseDateId);
        if (normalizedReleaseDateId != null) {
            String actualRelease = item.getReleaseDate() == null ? null : (normalizedReleaseDateId.startsWith("date:") ? "date:" + item.getReleaseDate().getPromDate() : item.getReleaseDate().getId().toString());
            if (!normalizedReleaseDateId.equals(actualRelease)) {
                return false;
            }
        }

        Set<String> selectedQuarterIds = normalizeFilterSet(quarterIds);
        if (!selectedQuarterIds.isEmpty() && collectPlanningItemQuarterIds(teamKey, item).stream().noneMatch(selectedQuarterIds::contains)) {
            return false;
        }

        Set<String> selectedStreams = normalizeFilterSet(streams);
        List<String> itemStreams = item.getStreams() == null ? List.of() : item.getStreams();
        if ((!selectedStreams.isEmpty() || Boolean.TRUE.equals(withoutStream))
            && !matchesStringCollection(itemStreams, selectedStreams, Boolean.TRUE.equals(withoutStream))) {
            return false;
        }

        Set<String> selectedCustomers = normalizeFilterSet(customers);
        List<String> itemCustomers = item.getCustomers() == null ? List.of() : item.getCustomers();
        if ((!selectedCustomers.isEmpty() || Boolean.TRUE.equals(withoutCustomer))
            && !matchesStringCollection(itemCustomers, selectedCustomers, Boolean.TRUE.equals(withoutCustomer))) {
            return false;
        }

        String normalizedSearch = normalizeOptional(search);
        if (normalizedSearch != null) {
            String needle = normalizedSearch.toLowerCase();
            String haystack = String.join(" ", nullToBlank(item.getTitle()), nullToBlank(item.getDescription()), nullToBlank(item.getDod()))
                .toLowerCase();
            if (!haystack.contains(needle)) {
                return false;
            }
        }

        return true;
    }

    private Set<String> splitFilterValues(String rawValue) {
        String normalized = normalizeOptional(rawValue);
        if (normalized == null) {
            return Set.of();
        }
        return Pattern.compile(",")
            .splitAsStream(normalized)
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Set<String> normalizeFilterSet(List<String> values) {
        if (values == null || values.isEmpty()) {
            return Set.of();
        }
        return values.stream()
            .filter(Objects::nonNull)
            .flatMap(value -> Pattern.compile(",").splitAsStream(value))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private boolean matchesStringCollection(List<String> itemValues, Set<String> selectedValues, boolean includeEmpty) {
        if ((itemValues == null || itemValues.isEmpty()) && includeEmpty) {
            return true;
        }
        if (selectedValues.isEmpty()) {
            return false;
        }
        return itemValues != null && itemValues.stream()
            .filter(Objects::nonNull)
            .anyMatch(selectedValues::contains);
    }

    private List<String> collectPlanningItemQuarterIds(String teamKey, PlanningBacklogItemEntity item) {
        LinkedHashSet<String> quarterIds = new LinkedHashSet<>();
        if (item.getPlanningQuarterIds() != null) {
            item.getPlanningQuarterIds().stream()
                .filter(Objects::nonNull)
                .map(UUID::toString)
                .forEach(quarterIds::add);
        }
        if (item.getPlanningSprintIds() != null && !item.getPlanningSprintIds().isEmpty()) {
            sprintRepository.findByTeamKeyAndIdIn(teamKey, item.getPlanningSprintIds()).forEach(sprint -> {
                if (sprint.getQuarter() != null && sprint.getQuarter().getId() != null) {
                    quarterIds.add(sprint.getQuarter().getId().toString());
                }
            });
        }
        if (quarterIds.isEmpty() && item.getInitialQuarter() != null && item.getInitialQuarter().getId() != null) {
            quarterIds.add(item.getInitialQuarter().getId().toString());
        }
        return List.copyOf(quarterIds);
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    private Comparator<PlanningBacklogItemEntity> planningItemComparator(
        String teamKey,
        String sortBy,
        String sortDirection
    ) {
        Comparator<PlanningBacklogItemEntity> comparator = planningPrimaryComparator(teamKey, sortBy, sortDirection);
        return comparator
            .thenComparingInt(PlanningBacklogItemEntity::getDisplayOrder)
            .thenComparing(item -> item.getCreatedAt() == null ? LocalDate.MAX : item.getCreatedAt())
            .thenComparing(item -> item.getId() == null ? "" : item.getId().toString());
    }

    private Comparator<PlanningBacklogItemEntity> planningPrimaryComparator(
        String teamKey,
        String sortBy,
        String sortDirection
    ) {
        String normalizedSortBy = normalizeSortBy(sortBy);
        boolean desc = isDescending(sortDirection);
        Comparator<PlanningBacklogItemEntity> comparator;
        if ("load".equals(normalizedSortBy)) {
            comparator = Comparator.comparing(this::sumPlanningItemLoad);
        } else if ("releaseDate".equals(normalizedSortBy)) {
            List<SprintEntity> sprints = sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey);
            Map<UUID, SprintEntity> sprintById = sprints.stream()
                .collect(Collectors.toMap(SprintEntity::getId, Function.identity(), (left, right) -> left));
            Map<UUID, QuarterEntity> quarterById = quarterRepository.findByTeamKeyOrderByStartDateAsc(teamKey).stream()
                .collect(Collectors.toMap(QuarterEntity::getId, Function.identity(), (left, right) -> left));
            comparator = Comparator.comparing(item -> planningItemDateSortKey(item, sprintById, quarterById));
        } else if ("priority".equals(normalizedSortBy)) {
            comparator = Comparator.comparingInt(item -> item.getPriority());
        } else {
            return (left, right) -> 0;
        }
        return desc ? comparator.reversed() : comparator;
    }

    private BigDecimal sumPlanningItemLoad(PlanningBacklogItemEntity item) {
        if (item.getPlanningDemands() == null || item.getPlanningDemands().isEmpty()) {
            return BigDecimal.ZERO;
        }
        return item.getPlanningDemands().stream()
            .map(TaskPlanningDemandValue::getDays)
            .filter(Objects::nonNull)
            .filter(days -> days.signum() > 0)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private LocalDate planningItemDateSortKey(
        PlanningBacklogItemEntity item,
        Map<UUID, SprintEntity> sprintById,
        Map<UUID, QuarterEntity> quarterById
    ) {
        if (item.getReleaseDate() != null && item.getReleaseDate().getPromDate() != null) {
            return item.getReleaseDate().getPromDate();
        }
        LocalDate sprintQuarterStart = item.getPlanningSprintIds() == null
            ? null
            : item.getPlanningSprintIds().stream()
                .map(sprintById::get)
                .filter(Objects::nonNull)
                .map(SprintEntity::getQuarter)
                .filter(Objects::nonNull)
                .map(QuarterEntity::getStartDate)
                .filter(Objects::nonNull)
                .min(LocalDate::compareTo)
                .orElse(null);
        if (sprintQuarterStart != null) {
            return sprintQuarterStart;
        }
        LocalDate planningQuarterStart = item.getPlanningQuarterIds() == null
            ? null
            : item.getPlanningQuarterIds().stream()
                .map(quarterById::get)
                .filter(Objects::nonNull)
                .map(QuarterEntity::getStartDate)
                .filter(Objects::nonNull)
                .min(LocalDate::compareTo)
                .orElse(null);
        if (planningQuarterStart != null) {
            return planningQuarterStart;
        }
        if (item.getInitialQuarter() != null && item.getInitialQuarter().getStartDate() != null) {
            return item.getInitialQuarter().getStartDate();
        }
        return LocalDate.MAX;
    }

    private String normalizeSortBy(String sortBy) {
        if (sortBy == null) {
            return "manual";
        }
        return switch (sortBy.trim()) {
            case "load", "releaseDate", "priority" -> sortBy.trim();
            default -> "manual";
        };
    }

    private boolean isDescending(String sortDirection) {
        return sortDirection != null && "desc".equalsIgnoreCase(sortDirection.trim());
    }

    @Transactional
    public PlanningWorkbenchItemDto transferTask(String teamKey, UUID taskId) {
        taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found"));
        var existing = planningBacklogItemRepository.findBySourceTaskIdAndTeamKey(taskId, teamKey);
        if (existing.isPresent()) return toPlanningItemDto(existing.get(), Map.of());
        var source = taskRepository.findWithDetailsById(taskId, teamKey);
        if (!"BACKLOG".equals(source.getWorkspace()) || !"backlog".equals(source.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "В планирование можно передать только задачу в статусе «В бэклоге»");
        }
        PlanningBacklogItemEntity item = new PlanningBacklogItemEntity();
        item.setTeamKey(teamKey); item.setSourceTaskId(taskId); item.setSourceRevision(source.getRevision());
        item.setTitle(source.getTitle()); item.setDescription(source.getDescription()); item.setDod(source.getDod()); item.setPriority(source.getPriority());
        item.setCustomers(source.getCustomers().stream().map(com.sber.isu.sprints_planning.model.TaskCustomerEntity::getName).sorted().toList());
        item.setStreams(source.getStreams().stream().map(com.sber.isu.sprints_planning.model.TaskStreamEntity::getName).sorted().toList());
        item.setReleaseDate(source.getReleaseDate()); item.setInitialQuarter(source.getInitialQuarter());
        item.setSourceNotes(source.getNotes() == null ? Map.of() : new LinkedHashMap<>(source.getNotes()));
        item.setSourceLeaderId(source.getLeaderParticipant() == null ? null : source.getLeaderParticipant().getId());
        item.setPlanningQuarterIds(source.getPlanningQuarterIds() == null ? List.of() : source.getPlanningQuarterIds());
        item.setPlanningSprintIds(source.getPlanningSprintIds() == null ? List.of() : source.getPlanningSprintIds());
        if (item.getPlanningQuarterIds().isEmpty()) {
            var quarters = source.getAllocations().stream().filter(a -> a.getDays().signum() > 0)
                .map(a -> a.getSprint().getQuarter().getId()).distinct().toList();
            item.setPlanningQuarterIds(!quarters.isEmpty() ? quarters : source.getInitialQuarter() == null ? List.of() : List.of(source.getInitialQuarter().getId()));
        }
        Map<UUID, BigDecimal> daysByParticipant = new LinkedHashMap<>();
        source.getAllocations().stream().filter(a -> a.getParticipant().isActive() && a.getDays().signum() > 0)
            .forEach(a -> daysByParticipant.merge(a.getParticipant().getId(), a.getDays(), BigDecimal::add));
        item.setPlanningDemands(source.getParticipants().stream().sorted(Comparator.comparingInt(com.sber.isu.sprints_planning.model.TaskParticipantEntity::getDisplayOrder))
            .filter(link -> link.getParticipant().isActive())
            .map(link -> new TaskPlanningDemandValue("PARTICIPANT", null, link.getParticipant().getId(), null, daysByParticipant.getOrDefault(link.getParticipant().getId(), BigDecimal.ZERO)))
            .toList());
        item.setDisplayOrder(planningBacklogItemRepository.findMaxDisplayOrder(teamKey) + 1);
        item.setCreatedAt(LocalDate.now()); item.setUpdatedAt(LocalDate.now());
        return toPlanningItemDto(planningBacklogItemRepository.save(item), Map.of());
    }

    @Transactional
    public PlanningWorkbenchItemDto createItem(String teamKey, PlanningWorkbenchItemRequest request) {
        PlanningBacklogItemEntity entity = new PlanningBacklogItemEntity();
        entity.setTeamKey(teamKey);
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setDisplayOrder(resolveDisplayOrder(teamKey, request.order()));
        applyItemState(teamKey, entity, request);
        PlanningBacklogItemEntity saved = planningBacklogItemRepository.save(entity);
        return toPlanningItemDto(saved, Map.of());
    }

    @Transactional
    public PlanningWorkbenchItemDto updateItem(String teamKey, String itemId, PlanningWorkbenchItemRequest request) {
        PlanningBacklogItemEntity entity = planningBacklogItemRepository.findWithDetailsById(UUID.fromString(itemId), teamKey);
        if (entity == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Planning item not found");
        }
        entity.setUpdatedAt(LocalDate.now());
        applyItemState(teamKey, entity, request);
        PlanningBacklogItemEntity saved = planningBacklogItemRepository.save(entity);
        return toPlanningItemDto(saved, Map.of());
    }

    @Transactional
    public void deleteItem(String teamKey, String itemId) {
        PlanningBacklogItemEntity entity = planningBacklogItemRepository.findWithDetailsById(UUID.fromString(itemId), teamKey);
        if (entity == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Planning item not found");
        }
        planningBacklogItemRepository.delete(entity);
    }

    @Transactional(readOnly = true)
    public PlanningWorkbenchPreviewDto preview(String teamKey, PlanningWorkbenchPreviewRequest request) {
        PlannerType plannerType = PlannerType.from(request.plannerType());
        PlanningSolverPort planner = plannersByType.get(plannerType);
        if (planner == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requested planner is not available");
        }
        List<PlanningBacklogItemEntity> items = fetchSelectedItems(teamKey, request.itemIds());
        if (items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No planning items selected");
        }

        List<SprintEntity> relevantSprints = resolveRelevantSprints(teamKey, items);
        if (relevantSprints.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected items do not have planning window");
        }

        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey).stream()
            .filter(ParticipantEntity::isActive)
            .toList();
        Map<String, Map<String, BigDecimal>> committed = aggregateCommittedLoad(teamKey, relevantSprints);
        List<PlanningDraftTask> draftTasks = toDraftTasks(items, teamKey);

        PlanningSolverResult solverResult = draftTasks.isEmpty()
            ? new PlanningSolverResult(plannerType, Map.of(), List.of(), BigDecimal.ZERO, BigDecimal.ZERO)
            : planner.solve(new PlanningSolverInput(
                plannerType,
                teamKey,
                draftTasks,
                participants,
                scaleSprintsToHalfDayUnits(relevantSprints),
                scaleLoadMatrix(committed, HALF_DAY_UNITS),
                capacityProperties.normFactor()
            ));
        PlanningSolverResult result = scaleSolverResultFromHalfDayUnits(solverResult);

        return buildPreview(items, participants, relevantSprints, committed, result);
    }

    @Transactional
    public List<TaskDto> apply(
        String teamKey,
        PlanningWorkbenchApplyRequest request,
        String rawSessionId,
        String rawUserName
    ) {
        planningBacklogItemRepository.lockSelected(teamKey, request.itemIds().stream().map(UUID::fromString).sorted().toList());
        List<PlanningBacklogItemEntity> items = fetchSelectedItems(teamKey, request.itemIds());
        if (items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No planning items selected");
        }
        Map<UUID, com.sber.isu.sprints_planning.model.TaskEntity> sources = new LinkedHashMap<>();
        for (var item : items.stream().filter(i -> i.getSourceTaskId() != null).sorted(Comparator.comparing(PlanningBacklogItemEntity::getSourceTaskId)).toList()) {
            taskRepository.findByIdAndTeamKeyForUpdate(item.getSourceTaskId(), teamKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Исходная задача удалена"));
            var source = taskRepository.findWithDetailsById(item.getSourceTaskId(), teamKey);
            if (!"backlog".equals(source.getStatus()) || !"BACKLOG".equals(source.getWorkspace()) || !Objects.equals(item.getSourceRevision(), source.getRevision())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Исходная задача изменена. Удалите её заготовку и передайте актуальную задачу в планирование заново.");
            }
            sources.put(source.getId(), source);
        }
        Map<String, ApplyItemState> applyStates = buildApplyStates(teamKey, items, request.itemPatches());
        Map<String, Map<String, Map<String, BigDecimal>>> normalized = normalizeAllocations(request.allocations());
        Map<String, SprintEntity> applySprints = validateAllocationMatrix(applyStates, normalized, teamKey);

        List<TaskService.PlanningMutation> mutations = new ArrayList<>();
        for (PlanningBacklogItemEntity item : items) {
            ApplyItemState applyState = applyStates.get(item.getId().toString());
            PlanningBacklogItemEntity itemState = applyState.item();
            Map<String, Map<String, BigDecimal>> itemAllocations = normalized.getOrDefault(item.getId().toString(), Map.of());
            Map<String, BigDecimal> loads = sumLoads(itemAllocations);
            List<String> participantIds = resolveParticipantIdsForCreate(
                itemState,
                itemAllocations,
                applyState.participantIdsOverride()
            );
            Short priority = itemState.getPriority();
            String status = applyState.statusOverride() != null
                ? applyState.statusOverride()
                : (loads.isEmpty() ? "backlog" : "inprogress");

            if (item.getSourceTaskId() != null) {
                var source = sources.get(item.getSourceTaskId());
                var merged = new LinkedHashMap<String, Map<String, BigDecimal>>();
                // Explicit zeros replace old active allocations; inactive rows retain historical data.
                for (var allocation : source.getAllocations()) {
                    merged.computeIfAbsent(allocation.getParticipant().getId().toString(), ignored -> new LinkedHashMap<>())
                        .put(allocation.getSprint().getId().toString(), allocation.getParticipant().isActive() ? BigDecimal.ZERO : allocation.getDays());
                }
                itemAllocations.forEach((pid, row) -> merged.computeIfAbsent(pid, ignored -> new LinkedHashMap<>()).putAll(row));
                var retainedParticipants = new LinkedHashSet<>(participantIds);
                source.getParticipants().stream().filter(link -> !link.getParticipant().isActive())
                    .forEach(link -> retainedParticipants.add(link.getParticipant().getId().toString()));
                Map<String, String> notes = new LinkedHashMap<>();
                if (source.getNotes() != null) source.getNotes().forEach((pid, note) -> notes.put(pid.toString(), note));
                applyState.notes().forEach((pid, note) -> {
                    if (note.isBlank()) notes.remove(pid);
                    else notes.put(pid, note);
                });
                String leader = applyState.leaderId() != null ? applyState.leaderId()
                    : source.getLeaderParticipant() == null ? "" : source.getLeaderParticipant().getId().toString();
                if (!retainedParticipants.contains(leader)) leader = "";
                mutations.add(new TaskService.PlanningMutation(null, new com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest(
                    source.getId().toString(), itemState.getTitle(), itemState.getDescription(), itemState.getDod(), priority, status,
                    itemState.getCustomers(), itemState.getStreams(), List.copyOf(retainedParticipants),
                    deriveAppliedPlanningQuarterIds(itemState, itemAllocations, teamKey, applySprints),
                    itemState.getPlanningSprintIds().stream().map(UUID::toString).toList(),
                    sumLoads(merged), merged, notes,
                    itemState.getReleaseDate() == null ? "" : itemState.getReleaseDate().getId().toString(),
                    itemState.getInitialQuarter() == null ? "" : itemState.getInitialQuarter().getId().toString(), leader, null)));
                continue;
            }
            mutations.add(new TaskService.PlanningMutation(new TaskCreateRequest(
                itemState.getTitle(),
                itemState.getDescription(),
                itemState.getDod(),
                priority,
                status,
                itemState.getCustomers() == null ? List.of() : List.copyOf(itemState.getCustomers()),
                itemState.getStreams() == null ? List.of() : List.copyOf(itemState.getStreams()),
                participantIds,
                deriveAppliedPlanningQuarterIds(itemState, itemAllocations, teamKey, applySprints),
                itemState.getPlanningSprintIds() == null ? List.of() : itemState.getPlanningSprintIds().stream().map(UUID::toString).toList(),
                loads,
                itemAllocations,
                applyState.notes(),
                itemState.getReleaseDate() != null ? itemState.getReleaseDate().getId().toString() : null,
                itemState.getInitialQuarter() != null ? itemState.getInitialQuarter().getId().toString() : null,
                applyState.leaderId(),
                null // New tasks append in selected-item order; draft order belongs to another list.
            ), null));
        }

        List<TaskDto> appliedTasks = taskService.applyPlanningBatch(teamKey, mutations);
        planningBacklogItemRepository.deleteAll(items);
        return appliedTasks;
    }

    private Map<String, ApplyItemState> buildApplyStates(
        String teamKey,
        List<PlanningBacklogItemEntity> items,
        Map<String, PlanningWorkbenchApplyItemPatchRequest> itemPatches
    ) {
        Map<String, ApplyItemState> result = items.stream()
            .collect(Collectors.toMap(
                item -> item.getId().toString(),
                item -> new ApplyItemState(copyPlanningItem(item), null, Map.of(), null, null),
                (left, right) -> left,
                LinkedHashMap::new
            ));
        if (itemPatches == null || itemPatches.isEmpty()) {
            return result;
        }
        Map<String, PlanningBacklogItemEntity> itemsById = items.stream()
            .collect(Collectors.toMap(item -> item.getId().toString(), Function.identity()));
        ItemResolutionCache cache = new ItemResolutionCache();
        itemPatches.forEach((itemId, patch) -> {
            if (patch == null) {
                return;
            }
            PlanningBacklogItemEntity source = itemsById.get(itemId);
            if (source == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more item patches do not match selected items");
            }
            PlanningBacklogItemEntity itemCopy = copyPlanningItem(source);
            applyItemState(teamKey, itemCopy, toPlanningWorkbenchItemRequest(patch), cache);
            itemCopy.setUpdatedAt(LocalDate.now());
            result.put(itemId, new ApplyItemState(
                itemCopy,
                normalizeOptional(patch.status()),
                normalizeNotes(patch.notes()),
                patch.leaderId() == null ? null : patch.leaderId().trim(),
                patch.participantIds() == null ? null : normalizeIdList(patch.participantIds())
            ));
        });
        return result;
    }

    private record ItemResolutionCache(
        Map<String, QuarterEntity> quarters, Map<String, SprintEntity> sprints, Map<String, ReleaseEntity> releases
    ) {
        ItemResolutionCache() { this(new LinkedHashMap<>(), new LinkedHashMap<>(), new LinkedHashMap<>()); }
    }

    private void applyItemState(String teamKey, PlanningBacklogItemEntity entity, PlanningWorkbenchItemRequest request) {
        applyItemState(teamKey, entity, request, new ItemResolutionCache());
    }

    private void applyItemState(String teamKey, PlanningBacklogItemEntity entity, PlanningWorkbenchItemRequest request, ItemResolutionCache cache) {
        entity.setTitle(request.title() == null || request.title().isBlank() ? "Новая задача" : request.title().trim());
        entity.setDescription(request.description() == null ? "" : request.description().trim());
        entity.setDod(request.dod() == null ? "" : request.dod().trim());
        entity.setPriority(request.priority() == null ? (short) 1 : request.priority());
        entity.setCustomers(normalizeStringList(request.customers()));
        entity.setStreams(normalizeStringList(request.streams()));
        if (request.planningDemands() != null) {
            entity.setPlanningDemands(normalizePlanningDemands(request.planningDemands()));
        }
        entity.setPlanningQuarterIds(normalizeIdList(request.planningQuarterIds()).stream().map(id -> cachedQuarter(teamKey, id, cache).getId()).distinct().toList());
        entity.setPlanningSprintIds(normalizeIdList(request.planningSprintIds()).stream().map(id -> cache.sprints().computeIfAbsent(id, key -> sprintRepository.findByIdAndTeamKey(UUID.fromString(key), teamKey).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprint not found"))).getId()).distinct().toList());
        String releaseKey = request.releasePromDate() + ":" + request.releaseDateId();
        entity.setReleaseDate(cache.releases().computeIfAbsent(releaseKey, ignored -> request.releasePromDate() != null
            ? releaseService.resolveDate(teamKey, request.releasePromDate(), request.releaseDateId()) : resolveRelease(teamKey, request.releaseDateId())));
        entity.setInitialQuarter(cachedQuarter(teamKey, request.initialQuarterId(), cache));
    }

    private QuarterEntity cachedQuarter(String teamKey, String id, ItemResolutionCache cache) {
        String normalized = normalizeOptional(id);
        return normalized == null ? null : cache.quarters().computeIfAbsent(normalized, key -> resolveQuarter(teamKey, key));
    }

    private PlanningWorkbenchItemRequest toPlanningWorkbenchItemRequest(PlanningWorkbenchApplyItemPatchRequest patch) {
        return new PlanningWorkbenchItemRequest(
            patch.title(),
            patch.description(),
            patch.dod(),
            patch.priority(),
            patch.customers(),
            patch.streams(),
            patch.planningDemands(),
            patch.releaseDateId(),
            patch.initialQuarterId(),
            patch.planningQuarterIds(),
            patch.planningSprintIds(),
            patch.order(),
            patch.releasePromDate()
        );
    }

    private PlanningBacklogItemEntity copyPlanningItem(PlanningBacklogItemEntity source) {
        PlanningBacklogItemEntity copy = new PlanningBacklogItemEntity();
        copy.setId(source.getId());
        copy.setSourceTaskId(source.getSourceTaskId()); copy.setSourceRevision(source.getSourceRevision());
        copy.setSourceNotes(source.getSourceNotes()); copy.setSourceLeaderId(source.getSourceLeaderId());
        copy.setTeamKey(source.getTeamKey());
        copy.setTitle(source.getTitle());
        copy.setDescription(source.getDescription());
        copy.setDod(source.getDod());
        copy.setPriority(source.getPriority());
        copy.setCustomers(source.getCustomers() == null ? List.of() : new ArrayList<>(source.getCustomers()));
        copy.setStreams(source.getStreams() == null ? List.of() : new ArrayList<>(source.getStreams()));
        copy.setPlanningDemands(copyPlanningDemands(source.getPlanningDemands()));
        copy.setPlanningQuarterIds(source.getPlanningQuarterIds() == null ? List.of() : new ArrayList<>(source.getPlanningQuarterIds()));
        copy.setPlanningSprintIds(source.getPlanningSprintIds() == null ? List.of() : new ArrayList<>(source.getPlanningSprintIds()));
        copy.setReleaseDate(source.getReleaseDate());
        copy.setInitialQuarter(source.getInitialQuarter());
        copy.setDisplayOrder(source.getDisplayOrder());
        copy.setCreatedAt(source.getCreatedAt());
        copy.setUpdatedAt(source.getUpdatedAt());
        return copy;
    }

    private List<TaskPlanningDemandValue> copyPlanningDemands(List<TaskPlanningDemandValue> demands) {
        if (demands == null) {
            return List.of();
        }
        return demands.stream()
            .filter(Objects::nonNull)
            .map(demand -> new TaskPlanningDemandValue(
                demand.getKind(),
                demand.getRole(),
                demand.getParticipantId(),
                demand.getStream(),
                demand.getDays()
            ))
            .toList();
    }

    private List<String> deriveAppliedPlanningQuarterIds(
        PlanningBacklogItemEntity item,
        Map<String, Map<String, BigDecimal>> itemAllocations,
        String teamKey,
        Map<String, SprintEntity> sprints
    ) {
        LinkedHashSet<String> quarterIds = new LinkedHashSet<>();
        if (item.getPlanningQuarterIds() != null) {
            item.getPlanningQuarterIds().stream()
                .filter(Objects::nonNull)
                .map(UUID::toString)
                .forEach(quarterIds::add);
        }
        if (!quarterIds.isEmpty()) {
            return List.copyOf(quarterIds);
        }

        LinkedHashSet<UUID> allocatedSprintIds = itemAllocations.values().stream()
            .flatMap(row -> row.entrySet().stream())
            .filter(entry -> entry.getValue() != null && entry.getValue().signum() > 0)
            .map(Map.Entry::getKey)
            .map(UUID::fromString)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (!allocatedSprintIds.isEmpty()) {
            sprints.values().stream().filter(sprint -> allocatedSprintIds.contains(sprint.getId()))
                .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
                .map(SprintEntity::getQuarter)
                .filter(Objects::nonNull)
                .map(QuarterEntity::getId)
                .filter(Objects::nonNull)
                .map(UUID::toString)
                .forEach(quarterIds::add);
        }
        if (quarterIds.isEmpty() && item.getInitialQuarter() != null && item.getInitialQuarter().getId() != null) {
            quarterIds.add(item.getInitialQuarter().getId().toString());
        }
        return List.copyOf(quarterIds);
    }

    private List<PlanningBacklogItemEntity> fetchSelectedItems(String teamKey, List<String> rawItemIds) {
        LinkedHashSet<UUID> itemIds = (rawItemIds == null ? List.<String>of() : rawItemIds).stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .map(UUID::fromString)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (itemIds.isEmpty()) {
            return List.of();
        }
        List<PlanningBacklogItemEntity> items = planningBacklogItemRepository.findAllWithDetailsByTeamKeyAndIdIn(teamKey, itemIds);
        if (items.size() != itemIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "One or more selected planning items do not exist");
        }
        Map<UUID, PlanningBacklogItemEntity> byId = items.stream()
            .collect(Collectors.toMap(PlanningBacklogItemEntity::getId, Function.identity()));
        return itemIds.stream()
            .map(byId::get)
            .filter(Objects::nonNull)
            .sorted(Comparator.comparingInt(PlanningBacklogItemEntity::getDisplayOrder).thenComparing(PlanningBacklogItemEntity::getCreatedAt))
            .toList();
    }

    private List<PlanningDraftTask> toDraftTasks(List<PlanningBacklogItemEntity> items, String teamKey) {
        List<PlanningDraftTask> draftTasks = new ArrayList<>();
        for (PlanningBacklogItemEntity item : items) {
            List<String> allowedSprintIds = resolveAllowedSprints(item, teamKey).stream()
                .map(sprint -> sprint.getId().toString())
                .toList();
            int demandOrder = 0;
            for (TaskPlanningDemandValue demand : resolvePlanningDemands(item)) {
                int halfDayUnits = halfDayUnits(demand.getDays());
                if (halfDayUnits <= 0) {
                    continue;
                }
                boolean roleDemand = "ROLE".equalsIgnoreCase(demand.getKind());
                String demandStream = normalizeOptional(demand.getStream());
                draftTasks.add(new PlanningDraftTask(
                    item.getId().toString(),
                    item.getTitle(),
                    item.getPriority(),
                    halfDayUnits,
                    roleDemand ? "ROLE_STREAM" : "SPECIFIC_PARTICIPANTS",
                    roleDemand ? demand.getRole() : null,
                    demandStream,
                    item.getReleaseDate() != null ? item.getReleaseDate().getPromDate() : null,
                    item.getReleaseDate() != null ? item.getReleaseDate().getDevEnd() : null,
                    item.getReleaseDate() != null ? item.getReleaseDate().getIftStart() : null,
                    item.getReleaseDate() != null ? item.getReleaseDate().getRegressStart() : null,
                    roleDemand || demand.getParticipantId() == null
                        ? List.of()
                        : List.of(demand.getParticipantId().toString()),
                    allowedSprintIds,
                    demandOrder++
                ));
            }
        }
        return draftTasks;
    }

    private List<SprintEntity> scaleSprintsToHalfDayUnits(List<SprintEntity> sprints) {
        return sprints.stream()
            .map(sprint -> {
                SprintEntity copy = new SprintEntity();
                copy.setId(sprint.getId());
                copy.setQuarter(sprint.getQuarter());
                copy.setName(sprint.getName());
                copy.setStartDate(sprint.getStartDate());
                copy.setEndDate(sprint.getEndDate());
                copy.setWorkingDays(sprint.getWorkingDays() * HALF_DAY_UNITS.intValueExact());
                copy.setOrder(sprint.getOrder());
                copy.setTeamKey(sprint.getTeamKey());
                return copy;
            })
            .toList();
    }

    private Map<String, Map<String, BigDecimal>> scaleLoadMatrix(
        Map<String, Map<String, BigDecimal>> source,
        BigDecimal multiplier
    ) {
        Map<String, Map<String, BigDecimal>> scaled = new LinkedHashMap<>();
        if (source == null) {
            return scaled;
        }
        source.forEach((participantId, sprintRows) -> {
            Map<String, BigDecimal> nextRow = new LinkedHashMap<>();
            if (sprintRows != null) {
                sprintRows.forEach((sprintId, days) -> {
                    BigDecimal units = normalizeHalfDays(days).multiply(multiplier);
                    if (units.signum() > 0) {
                        nextRow.put(sprintId, units);
                    }
                });
            }
            if (!nextRow.isEmpty()) {
                scaled.put(participantId, nextRow);
            }
        });
        return scaled;
    }

    private PlanningSolverResult scaleSolverResultFromHalfDayUnits(PlanningSolverResult result) {
        Map<String, Map<String, Map<String, BigDecimal>>> allocations = new LinkedHashMap<>();
        if (result.taskAllocations() != null) {
            result.taskAllocations().forEach((taskId, participantRows) -> {
                Map<String, Map<String, BigDecimal>> nextParticipants = new LinkedHashMap<>();
                if (participantRows != null) {
                    participantRows.forEach((participantId, sprintRows) -> {
                        Map<String, BigDecimal> nextSprints = new LinkedHashMap<>();
                        if (sprintRows != null) {
                            sprintRows.forEach((sprintId, units) -> {
                                BigDecimal days = unitsToHalfDays(units);
                                if (days.signum() > 0) {
                                    nextSprints.put(sprintId, days);
                                }
                            });
                        }
                        if (!nextSprints.isEmpty()) {
                            nextParticipants.put(participantId, nextSprints);
                        }
                    });
                }
                allocations.put(taskId, nextParticipants);
            });
        }

        return new PlanningSolverResult(
            result.plannerType(),
            allocations,
            scaleWarningsFromHalfDayUnits(result.warnings()),
            unitsToHalfDays(result.plannedDays()),
            unitsToHalfDays(result.unplannedDays())
        );
    }

    private List<String> scaleWarningsFromHalfDayUnits(List<String> warnings) {
        if (warnings == null || warnings.isEmpty()) {
            return List.of();
        }

        return warnings.stream()
            .map(this::scaleWarningFromHalfDayUnits)
            .toList();
    }

    private String scaleWarningFromHalfDayUnits(String warning) {
        if (warning == null || warning.isBlank()) {
            return warning;
        }

        Matcher matcher = UNPLANNED_WARNING_PATTERN.matcher(warning);
        if (!matcher.find()) {
            return warning;
        }

        BigDecimal days = unitsToHalfDays(new BigDecimal(matcher.group(2)));
        String formattedDays = days.stripTrailingZeros().toPlainString();
        return matcher.replaceFirst(Matcher.quoteReplacement(matcher.group(1) + formattedDays + matcher.group(3)));
    }

    private List<SprintEntity> resolveRelevantSprints(String teamKey, List<PlanningBacklogItemEntity> items) {
        LinkedHashSet<UUID> sprintIds = new LinkedHashSet<>();
        for (PlanningBacklogItemEntity item : items) {
            resolveAllowedSprints(item, teamKey).forEach(sprint -> sprintIds.add(sprint.getId()));
        }
        return sprintIds.isEmpty()
            ? List.of()
            : sprintRepository.findByTeamKeyAndIdIn(teamKey, sprintIds).stream()
                .sorted(Comparator.comparing((SprintEntity sprint) -> sprint.getQuarter().getStartDate()).thenComparingInt(SprintEntity::getOrder))
                .toList();
    }

    private boolean isSprintAllowed(PlanningBacklogItemEntity item, SprintEntity sprint) {
        if (item.getPlanningSprintIds() != null && !item.getPlanningSprintIds().isEmpty()) {
            return item.getPlanningSprintIds().contains(sprint.getId());
        }
        if (item.getPlanningQuarterIds() != null && !item.getPlanningQuarterIds().isEmpty()) {
            return item.getPlanningQuarterIds().contains(sprint.getQuarter().getId());
        }
        return item.getInitialQuarter() != null && item.getInitialQuarter().getId().equals(sprint.getQuarter().getId());
    }

    private List<SprintEntity> resolveAllowedSprints(PlanningBacklogItemEntity item, String teamKey) {
        if (item.getPlanningSprintIds() != null && !item.getPlanningSprintIds().isEmpty()) {
            return sprintRepository.findByTeamKeyAndIdIn(teamKey, item.getPlanningSprintIds()).stream()
                .sorted(Comparator.comparing(SprintEntity::getStartDate).thenComparingInt(SprintEntity::getOrder))
                .toList();
        }
        if (item.getPlanningQuarterIds() != null && !item.getPlanningQuarterIds().isEmpty()) {
            return sprintRepository.findByTeamKeyAndQuarterIdsOrderByQuarterAndOrder(teamKey, item.getPlanningQuarterIds());
        }
        if (item.getInitialQuarter() != null) {
            return sprintRepository.findByTeamKeyAndQuarterIdOrderByOrderAsc(teamKey, item.getInitialQuarter().getId());
        }
        return List.of();
    }

    private Map<String, Map<String, BigDecimal>> aggregateCommittedLoad(String teamKey, List<SprintEntity> sprints) {
        List<WorkloadAggregation> aggregations = taskAllocationRepository.aggregateWorkloadByParticipantAndSprint(
            teamKey,
            sprints.stream().map(SprintEntity::getId).toList()
        );
        Map<String, Map<String, BigDecimal>> result = new LinkedHashMap<>();
        for (WorkloadAggregation aggregation : aggregations) {
            if (aggregation.getParticipantId() == null || aggregation.getSprintId() == null || aggregation.getTotalDays() == null) {
                continue;
            }
            result.computeIfAbsent(aggregation.getParticipantId().toString(), key -> new LinkedHashMap<>())
                .put(aggregation.getSprintId().toString(), normalizeHalfDays(aggregation.getTotalDays()));
        }
        return result;
    }

    private PlanningWorkbenchPreviewDto buildPreview(
        List<PlanningBacklogItemEntity> items,
        List<ParticipantEntity> participants,
        List<SprintEntity> relevantSprints,
        Map<String, Map<String, BigDecimal>> committed,
        PlanningSolverResult result
    ) {
        Map<String, Map<String, Map<String, BigDecimal>>> allocationMatrix = normalizeAllocations(result.taskAllocations());
        List<PlanningWorkbenchItemDto> itemDtos = items.stream()
            .map(item -> toPlanningItemDto(item, allocationMatrix.getOrDefault(item.getId().toString(), Map.of())))
            .toList();
        List<PlanningSessionParticipantLoadRowDto> participantSummary = buildParticipantSummary(participants, relevantSprints, committed, allocationMatrix);
        BigDecimal plannedDays = result.plannedDays();
        BigDecimal requiredDays = items.stream()
            .flatMap(item -> resolvePlanningDemands(item).stream())
            .map(TaskPlanningDemandValue::getDays)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unplannedDays = requiredDays.subtract(plannedDays).max(BigDecimal.ZERO);
        int overloadedCells = participantSummary.stream()
            .flatMap(row -> row.cells().stream())
            .mapToInt(cell -> cell.overload().compareTo(BigDecimal.ZERO) > 0 ? 1 : 0)
            .sum();
        LinkedHashSet<String> warnings = new LinkedHashSet<>(result.warnings());
        if (warnings.isEmpty() && unplannedDays.compareTo(BigDecimal.ZERO) > 0) {
            warnings.add("Не все дни распределены. Проверьте выбранные задачи и ограничения.");
        }
        return new PlanningWorkbenchPreviewDto(
            items.stream().map(item -> item.getId().toString()).toList(),
            relevantSprints.stream().map(sprint -> sprint.getId().toString()).toList(),
            new PlanningSessionSolveSummaryDto(items.size(), participantSummary.size(), plannedDays, unplannedDays, overloadedCells),
            List.copyOf(warnings),
            itemDtos,
            participantSummary,
            unplannedDays.compareTo(BigDecimal.ZERO) == 0 && warnings.isEmpty()
        );
    }

    private PlanningWorkbenchItemDto toPlanningItemDto(
        PlanningBacklogItemEntity item,
        Map<String, Map<String, BigDecimal>> allocations
    ) {
        return new PlanningWorkbenchItemDto(
            item.getId().toString(),
            item.getTitle(),
            item.getDescription(),
            item.getDod(),
            item.getPriority(),
            item.getCustomers() == null ? List.of() : List.copyOf(item.getCustomers()),
            item.getStreams() == null ? List.of() : List.copyOf(item.getStreams()),
            totalEstimateDays(item),
            resolvePlanningDemands(item).stream()
                .map(demand -> new TaskPlanningDemandDto(
                    demand.getKind(),
                    demand.getRole(),
                    demand.getParticipantId() != null ? demand.getParticipantId().toString() : null,
                    demand.getStream(),
                    normalizeHalfDays(demand.getDays())
                ))
                .toList(),
            item.getPlanningQuarterIds() == null ? List.of() : item.getPlanningQuarterIds().stream().map(UUID::toString).toList(),
            item.getPlanningSprintIds() == null ? List.of() : item.getPlanningSprintIds().stream().map(UUID::toString).toList(),
            sumLoads(allocations),
            allocations,
            item.getReleaseDate() != null ? item.getReleaseDate().getId().toString() : null,
            item.getInitialQuarter() != null ? item.getInitialQuarter().getId().toString() : null,
            item.getDisplayOrder(),
            item.getCreatedAt() != null ? item.getCreatedAt().toString() : null,
            item.getUpdatedAt() != null ? item.getUpdatedAt().toString() : null,
            item.getReleaseDate() == null ? null : item.getReleaseDate().getPromDate().toString(),
            item.getSourceTaskId() == null ? null : item.getSourceTaskId().toString(),
            item.getSourceNotes().entrySet().stream().collect(Collectors.toMap(e -> e.getKey().toString(), Map.Entry::getValue)),
            item.getSourceLeaderId() == null ? null : item.getSourceLeaderId().toString()
        );
    }

    private List<PlanningSessionParticipantLoadRowDto> buildParticipantSummary(
        List<ParticipantEntity> participants,
        List<SprintEntity> relevantSprints,
        Map<String, Map<String, BigDecimal>> committed,
        Map<String, Map<String, Map<String, BigDecimal>>> allocations
    ) {
        Map<String, Map<String, BigDecimal>> draft = new LinkedHashMap<>();
        allocations.values().forEach(taskRows ->
            taskRows.forEach((participantId, sprintRow) ->
                sprintRow.forEach((sprintId, days) ->
                    draft.computeIfAbsent(participantId, key -> new LinkedHashMap<>())
                        .merge(sprintId, normalizeHalfDays(days), BigDecimal::add)
                )
            )
        );
        List<PlanningSessionParticipantLoadRowDto> rows = new ArrayList<>();
        for (ParticipantEntity participant : participants) {
            List<PlanningSessionParticipantLoadCellDto> cells = new ArrayList<>();
            BigDecimal totalCapacity = BigDecimal.ZERO;
            BigDecimal totalCommitted = BigDecimal.ZERO;
            BigDecimal totalDraft = BigDecimal.ZERO;
            BigDecimal total = BigDecimal.ZERO;
            BigDecimal totalOverload = BigDecimal.ZERO;
            BigDecimal totalFree = BigDecimal.ZERO;
            for (SprintEntity sprint : relevantSprints) {
                BigDecimal capacity = computeCapacityDays(participant, sprint);
                BigDecimal committedDays = committed.getOrDefault(participant.getId().toString(), Map.of()).getOrDefault(sprint.getId().toString(), BigDecimal.ZERO);
                BigDecimal draftDays = draft.getOrDefault(participant.getId().toString(), Map.of()).getOrDefault(sprint.getId().toString(), BigDecimal.ZERO);
                BigDecimal cellTotal = committedDays.add(draftDays);
                BigDecimal overload = cellTotal.subtract(capacity).max(BigDecimal.ZERO);
                BigDecimal free = capacity.subtract(cellTotal).max(BigDecimal.ZERO);
                cells.add(new PlanningSessionParticipantLoadCellDto(
                    participant.getId().toString(),
                    sprint.getId().toString(),
                    capacity,
                    committedDays,
                    draftDays,
                    cellTotal,
                    overload,
                    free
                ));
                totalCapacity = totalCapacity.add(capacity);
                totalCommitted = totalCommitted.add(committedDays);
                totalDraft = totalDraft.add(draftDays);
                total = total.add(cellTotal);
                totalOverload = totalOverload.add(overload);
                totalFree = totalFree.add(free);
            }
            ParticipantDto participantDto = DtoMapper.toParticipantDto(participant);
            rows.add(new PlanningSessionParticipantLoadRowDto(
                participantDto,
                cells,
                totalCapacity.doubleValue(),
                totalCommitted.doubleValue(),
                totalDraft.doubleValue(),
                total.doubleValue(),
                totalOverload.doubleValue(),
                totalFree.doubleValue()
            ));
        }
        return rows;
    }

    private Map<String, SprintEntity> validateAllocationMatrix(
        Map<String, ApplyItemState> applyStates,
        Map<String, Map<String, Map<String, BigDecimal>>> allocations,
        String teamKey
    ) {
        Map<String, ParticipantEntity> participantsById = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey).stream()
            .filter(ParticipantEntity::isActive)
            .collect(Collectors.toMap(participant -> participant.getId().toString(), Function.identity()));
        Map<String, SprintEntity> sprintsById = sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey).stream()
            .collect(Collectors.toMap(sprint -> sprint.getId().toString(), Function.identity()));
        for (ApplyItemState applyState : applyStates.values()) {
            PlanningBacklogItemEntity item = applyState.item();
            Map<String, Map<String, BigDecimal>> itemAllocations = allocations.getOrDefault(item.getId().toString(), Map.of());
            List<SprintEntity> allowedSprints = sprintsById.values().stream().filter(sprint -> isSprintAllowed(item, sprint)).toList();
            Set<String> allowedSprintIds = allowedSprints.stream()
                .map(sprint -> sprint.getId().toString())
                .collect(Collectors.toCollection(LinkedHashSet::new));
            Set<String> allowedParticipantOverrides = (applyState.participantIdsOverride() == null ? List.<String>of() : applyState.participantIdsOverride()).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
            for (Map.Entry<String, Map<String, BigDecimal>> participantEntry : itemAllocations.entrySet()) {
                ParticipantEntity participant = participantsById.get(participantEntry.getKey());
                if (participant == null
                    || (!allowedParticipantOverrides.contains(participantEntry.getKey()) && !isParticipantAllowed(item, participant))) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Planning item '" + item.getTitle() + "' has allocation outside allowed participants");
                }
                for (String sprintId : participantEntry.getValue().keySet()) {
                    SprintEntity sprint = sprintsById.get(sprintId);
                    if (sprint == null || !allowedSprintIds.contains(sprintId)) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Planning item '" + item.getTitle() + "' has allocation outside planning window");
                    }
                    if (releaseWindowDays(sprint, item.getReleaseDate() != null ? item.getReleaseDate().getPromDate() : null) <= 0) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Planning item '" + item.getTitle() + "' has allocation after release deadline");
                    }
                }
            }
        }
        return sprintsById;
    }

    private boolean isParticipantAllowed(PlanningBacklogItemEntity item, ParticipantEntity participant) {
        List<TaskPlanningDemandValue> demands = resolvePlanningDemands(item);
        if (demands.isEmpty()) {
            return false;
        }
        return demands.stream().anyMatch(demand -> matchesDemand(participant, demand));
    }

    private List<String> resolveParticipantIdsForCreate(
        PlanningBacklogItemEntity item,
        Map<String, Map<String, BigDecimal>> itemAllocations,
        List<String> participantIdsOverride
    ) {
        LinkedHashSet<String> participantIds = new LinkedHashSet<>(participantIdsOverride == null ? List.of() : participantIdsOverride);
        (participantIdsOverride == null ? resolvePlanningDemands(item) : List.<TaskPlanningDemandValue>of()).stream()
            .filter(demand -> "PARTICIPANT".equalsIgnoreCase(demand.getKind()) && demand.getParticipantId() != null)
            .map(demand -> demand.getParticipantId().toString())
            .forEach(participantIds::add);
        participantIds.addAll(itemAllocations.keySet());
        return List.copyOf(participantIds);
    }

    private List<TaskPlanningDemandValue> resolvePlanningDemands(PlanningBacklogItemEntity item) {
        if (item.getPlanningDemands() == null) {
            return List.of();
        }
        return item.getPlanningDemands().stream()
            .filter(demand -> demand != null && demand.getDays() != null && (demand.getDays().signum() > 0 || (demand.getDays().signum() == 0 && "PARTICIPANT".equalsIgnoreCase(demand.getKind()))))
            .toList();
    }

    private boolean matchesDemand(ParticipantEntity participant, TaskPlanningDemandValue demand) {
        if ("PARTICIPANT".equalsIgnoreCase(demand.getKind())) {
            if (demand.getParticipantId() == null || !demand.getParticipantId().equals(participant.getId())) {
                return false;
            }
            String demandStream = normalizeOptional(demand.getStream());
            if (demandStream == null || demandStream.isBlank()) {
                return true;
            }
            final String normalizedDemandStream = demandStream.trim();
            return participant.getUserStreams() != null
                && participant.getUserStreams().stream()
                    .filter(Objects::nonNull)
                    .anyMatch(value -> normalizedDemandStream.equalsIgnoreCase(value.trim()));
        }
        if (!"ROLE".equalsIgnoreCase(demand.getKind())) {
            return false;
        }
        if (demand.getRole() != null && !demand.getRole().isBlank()) {
            if (participant.getRole() == null || !demand.getRole().trim().equalsIgnoreCase(participant.getRole().trim())) {
                return false;
            }
        }
        String demandStream = normalizeOptional(demand.getStream());
        if (demandStream == null || demandStream.isBlank()) {
            return true;
        }
        final String normalizedDemandStream = demandStream.trim();
        return participant.getUserStreams() != null
            && participant.getUserStreams().stream()
                .filter(Objects::nonNull)
                .anyMatch(value -> normalizedDemandStream.equalsIgnoreCase(value.trim()));
    }

    private BigDecimal totalEstimateDays(PlanningBacklogItemEntity item) {
        return resolvePlanningDemands(item).stream()
            .map(TaskPlanningDemandValue::getDays)
            .map(this::normalizeHalfDays)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private Map<String, Map<String, Map<String, BigDecimal>>> normalizeAllocations(
        Map<String, Map<String, Map<String, BigDecimal>>> allocations
    ) {
        Map<String, Map<String, Map<String, BigDecimal>>> normalized = new LinkedHashMap<>();
        if (allocations == null) {
            return normalized;
        }
        allocations.forEach((itemId, participantRows) -> {
            Map<String, Map<String, BigDecimal>> nextParticipants = new LinkedHashMap<>();
            if (participantRows != null) {
                participantRows.forEach((participantId, sprintRows) -> {
                    Map<String, BigDecimal> nextSprints = new LinkedHashMap<>();
                    if (sprintRows != null) {
                        sprintRows.forEach((sprintId, days) -> {
                            BigDecimal rounded = normalizeHalfDays(days);
                            if (rounded.signum() > 0) {
                                nextSprints.put(sprintId, rounded);
                            }
                        });
                    }
                    if (!nextSprints.isEmpty()) {
                        nextParticipants.put(participantId, nextSprints);
                    }
                });
            }
            normalized.put(itemId, nextParticipants);
        });
        return normalized;
    }

    private Map<String, BigDecimal> sumLoads(Map<String, Map<String, BigDecimal>> allocations) {
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        allocations.values().forEach(row -> row.forEach((sprintId, days) -> result.merge(sprintId, normalizeHalfDays(days), BigDecimal::add)));
        return result;
    }

    private BigDecimal computeCapacityDays(ParticipantEntity participant, SprintEntity sprint) {
        BigDecimal rate = participant.getRate() == null ? BigDecimal.ZERO : participant.getRate();
        return BigDecimal.valueOf(sprint.getWorkingDays())
            .multiply(rate)
            .multiply(BigDecimal.valueOf(capacityProperties.normFactor()))
            .multiply(HALF_DAY_UNITS)
            .setScale(0, RoundingMode.DOWN)
            .divide(HALF_DAY_UNITS, 1, RoundingMode.UNNECESSARY);
    }

    private BigDecimal normalizeHalfDays(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(1);
        }

        BigDecimal nonNegative = value.max(BigDecimal.ZERO);
        BigDecimal doubled = nonNegative.multiply(HALF_DAY_UNITS);

        if (doubled.stripTrailingZeros().scale() > 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Нагрузка должна быть кратна 0.5 дня"
            );
        }

        return doubled
            .setScale(0, RoundingMode.UNNECESSARY)
            .divide(HALF_DAY_UNITS, 1, RoundingMode.UNNECESSARY);
    }

    private BigDecimal unitsToHalfDays(BigDecimal value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(1);
        }

        return value
            .max(BigDecimal.ZERO)
            .setScale(0, RoundingMode.UNNECESSARY)
            .divide(HALF_DAY_UNITS, 1, RoundingMode.UNNECESSARY);
    }

    private int halfDayUnits(BigDecimal value) {
        return normalizeHalfDays(value)
            .multiply(HALF_DAY_UNITS)
            .intValueExact();
    }

    private static final BigDecimal HALF_DAY_UNITS = BigDecimal.valueOf(2);
    private static final Pattern UNPLANNED_WARNING_PATTERN = Pattern.compile("(не распределена полностью: )([0-9]+(?:\\.[0-9]+)?)( дн\\.)");

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
        long totalCalendarDays = java.time.temporal.ChronoUnit.DAYS.between(sprint.getStartDate(), sprint.getEndDate()) + 1;
        long allowedCalendarDays = java.time.temporal.ChronoUnit.DAYS.between(sprint.getStartDate(), releasePromDate) + 1;
        if (totalCalendarDays <= 0 || allowedCalendarDays <= 0) {
            return 0;
        }
        double ratio = Math.min(1.0d, Math.max(0.0d, (double) allowedCalendarDays / (double) totalCalendarDays));
        return BigDecimal.valueOf(sprint.getWorkingDays())
            .multiply(BigDecimal.valueOf(ratio))
            .setScale(0, RoundingMode.DOWN)
            .intValue();
    }

    private List<String> normalizeStringList(Collection<String> values) {
        if (values == null) {
            return List.of();
        }
        LinkedHashSet<String> normalized = values.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
        return List.copyOf(normalized);
    }

    private List<String> normalizeIdList(Collection<String> values) {
        return normalizeStringList(values);
    }

    private Map<String, String> normalizeNotes(Map<String, String> notes) {
        if (notes == null) {
            return Map.of();
        }
        LinkedHashMap<String, String> normalized = new LinkedHashMap<>();
        notes.forEach((participantId, value) -> {
            String normalizedParticipantId = normalizeOptional(participantId);
            String normalizedValue = normalizeOptional(value);
            if (normalizedParticipantId != null) {
                normalized.put(normalizedParticipantId, normalizedValue == null ? "" : normalizedValue);
            }
        });
        return Map.copyOf(normalized);
    }

    private List<TaskPlanningDemandValue> normalizePlanningDemands(List<TaskPlanningDemandRequest> demands) {
        if (demands == null) {
            return List.of();
        }
        List<TaskPlanningDemandValue> normalized = new ArrayList<>();
        for (TaskPlanningDemandRequest demand : demands) {
            if (demand == null) {
                continue;
            }
            String kind = normalizeOptional(demand.kind());
            if (kind == null) {
                continue;
            }
            String upperKind = kind.toUpperCase();
            BigDecimal days = normalizeHalfDays(demand.days());
            if (days.signum() < 0 || (days.signum() == 0 && !"PARTICIPANT".equals(upperKind))) {
                continue;
            }
            if ("ROLE".equals(upperKind)) {
                String role = normalizeOptional(demand.role());
                if (role == null) {
                    continue;
                }
                normalized.add(new TaskPlanningDemandValue(upperKind, role, null, normalizeOptional(demand.stream()), days));
                continue;
            }
            if (!"PARTICIPANT".equals(upperKind)) {
                continue;
            }
            if (demand.participantId() == null || demand.participantId().isBlank()) {
                continue;
            }
            normalized.add(new TaskPlanningDemandValue(
                upperKind,
                null,
                UUID.fromString(demand.participantId().trim()),
                normalizeOptional(demand.stream()),
                days
            ));
        }
        return List.copyOf(normalized);
    }

    private ReleaseEntity resolveRelease(String teamKey, String releaseDateId) {
        String normalized = normalizeOptional(releaseDateId);
        if (normalized == null) {
            return null;
        }
        return releaseRepository.findByIdAndTeamKey(UUID.fromString(normalized), teamKey)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Release not found"));
    }

    private QuarterEntity resolveQuarter(String teamKey, String quarterId) {
        String normalized = normalizeOptional(quarterId);
        if (normalized == null) {
            return null;
        }
        return quarterRepository.findByIdAndTeamKey(UUID.fromString(normalized), teamKey)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quarter not found"));
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private int resolveDisplayOrder(String teamKey, Integer requestedOrder) {
        int max = planningBacklogItemRepository.findMaxDisplayOrder(teamKey);
        if (requestedOrder == null) {
            return max + 1;
        }
        return Math.max(1, requestedOrder);
    }

    private record ApplyItemState(
        PlanningBacklogItemEntity item,
        String statusOverride,
        Map<String, String> notes,
        String leaderId,
        List<String> participantIdsOverride
    ) {
    }
}
