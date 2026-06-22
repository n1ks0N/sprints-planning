package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryChangeDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationMultiRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.TaskCustomerRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import java.util.ArrayList;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class TaskService {

    private static final String DEFAULT_STATUS = "inprogress";
    private static final Set<String> ALLOWED_STATUSES = Set.of(
        "inprogress",
        "done",
        "notdone",
        "canceled",
        "partial",
        "backlog"
    );
    private final TaskRepository taskRepository;
    private final TaskLoadRepository taskLoadRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final QuarterRepository quarterRepository;
    private final ReleaseRepository releaseRepository;
    private final TaskStreamRepository taskStreamRepository;
    private final TaskCustomerRepository taskCustomerRepository;
    private final TaskJiraIssueRepository taskJiraIssueRepository;
    private final ApiHistoryService apiHistoryService;

    public TaskService(TaskRepository taskRepository,
        TaskLoadRepository taskLoadRepository,
        TaskAllocationRepository taskAllocationRepository,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        QuarterRepository quarterRepository,
        ReleaseRepository releaseRepository,
        TaskStreamRepository taskStreamRepository,
        TaskCustomerRepository taskCustomerRepository,
        TaskJiraIssueRepository taskJiraIssueRepository,
        ApiHistoryService apiHistoryService) {
        this.taskRepository = taskRepository;
        this.taskLoadRepository = taskLoadRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.quarterRepository = quarterRepository;
        this.releaseRepository = releaseRepository;
        this.taskStreamRepository = taskStreamRepository;
        this.taskCustomerRepository = taskCustomerRepository;
        this.taskJiraIssueRepository = taskJiraIssueRepository;
        this.apiHistoryService = apiHistoryService;
    }

    @Transactional
    public List<TaskDto> findAll(String teamKey, TaskFilter filter) {
        return findFilteredTasks(teamKey, filter);
    }

    @Transactional
    public Page<TaskDto> findPage(String teamKey, TaskFilter filter, Integer page, Integer size) {
        return findPage(teamKey, filter, page, size, null, null);
    }

    @Transactional
    public Page<TaskDto> findPage(
        String teamKey,
        TaskFilter filter,
        Integer page,
        Integer size,
        String sortBy,
        String sortDirection
    ) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        int safePage = page == null ? 0 : Math.max(page, 0);
        int safeSize = size == null ? 50 : Math.min(Math.max(size, 1), 200);
        Page<TaskEntity> filtered = taskRepository.findFilteredPageWithDetails(
            teamKey,
            effectiveFilter,
            safePage,
            safeSize,
            sortBy,
            sortDirection
        );
        List<TaskDto> content = toDtos(teamKey, filtered.getContent());
        return new PageImpl<>(content, filtered.getPageable(), filtered.getTotalElements());
    }

    public TaskDto findById(String teamKey, UUID id) {
        TaskEntity entity = taskRepository.findWithDetailsById(id, teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
        return toDto(teamKey, entity);
    }

    private List<TaskDto> findFilteredTasks(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        List<TaskEntity> tasks = taskRepository.findFilteredWithDetails(teamKey, effectiveFilter);
        return toDtos(teamKey, tasks);
    }

    @Transactional
    public TaskDto create(String teamKey, TaskCreateRequest request) {
        TaskEntity entity = new TaskEntity();
        String title = request.title() == null || request.title().isBlank() ? "Новая задача" : request.title();
        entity.setTitle(title);
        entity.setDescription(request.description() != null ? request.description() : "");
        entity.setDod(request.dod() != null ? request.dod() : "");
        entity.setPriority(request.priority() != null ? request.priority() : (short) 2);
        entity.setStatus(normalizeStatus(request.status()));
        entity.setCustomer("");
        entity.setStream("");
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setNotes(convertNotes(request.notes()));
        entity.setPlanningQuarterIds(resolvePlanningQuarterIds(request.planningQuarterIds()));
        entity.setPlanningSprintIds(resolvePlanningSprintIds(teamKey, request.planningSprintIds()));
        if (request.releaseDateId() != null) {
            entity.setReleaseDate(resolveRelease(teamKey, request.releaseDateId()));
        }
        if (request.initialQuarterId() != null && !request.initialQuarterId().isBlank()) {
            entity.setInitialQuarter(resolveQuarter(teamKey, request.initialQuarterId()));
        }
        if (request.leaderId() != null && !request.leaderId().isBlank()) {
            entity.setLeaderParticipant(fetchParticipant(teamKey, request.leaderId()));
        }
        entity.setTeamKey(teamKey);
        entity.setDisplayOrder(resolveDisplayOrder(teamKey, request.order()));
        TaskEntity saved = taskRepository.save(entity);

        // Handle customers (multi-value)
        if (request.customers() != null) {
            updateTaskCustomers(teamKey, saved, request.customers());
        }
        // Handle streams (multi-value)
        if (request.streams() != null) {
            updateTaskStreams(teamKey, saved, request.streams());
        }
        syncLegacyCustomerAndStream(saved);

        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        updateParticipants(teamKey, saved, request.participantIds(), sprints);
        applyLoads(saved, request.loads(), sprintIndex);
        applyAllocations(saved, request.allocations(), sprintIndex);
        TaskHistorySnapshot createdSnapshot = snapshotTask(saved);
        List<TaskHistoryChangeDto> changes = buildTaskUpdateChanges(emptyTaskHistorySnapshot(), createdSnapshot);
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                saved.getId(),
                "task.create",
                "Создана задача",
                changes,
                Map.of(
                    "source", "POST /tasks",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, saved);
    }

    @Transactional
    public TaskDto update(String teamKey, TaskUpdateRequest request) {
        TaskEntity entity = taskRepository.findWithDetailsById(UUID.fromString(request.id()), teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
        TaskHistorySnapshot beforeSnapshot = snapshotTask(entity);
        if (request.title() != null) {
            entity.setTitle(request.title());
        }
        if (request.description() != null) {
            entity.setDescription(request.description());
        }
        if (request.dod() != null) {
            entity.setDod(request.dod());
        }
        if (request.priority() != null) {
            entity.setPriority(request.priority());
        }
        if (request.status() != null) {
            entity.setStatus(normalizeStatus(request.status()));
        }
        if (request.customers() != null) {
            updateTaskCustomers(teamKey, entity, request.customers());
        }
        if (request.streams() != null) {
            updateTaskStreams(teamKey, entity, request.streams());
        }
        syncLegacyCustomerAndStream(entity);
        if (request.planningQuarterIds() != null) {
            entity.setPlanningQuarterIds(resolvePlanningQuarterIds(request.planningQuarterIds()));
        }
        if (request.planningSprintIds() != null) {
            entity.setPlanningSprintIds(resolvePlanningSprintIds(teamKey, request.planningSprintIds()));
        }
        if (request.releaseDateId() != null) {
            entity.setReleaseDate(resolveRelease(teamKey, request.releaseDateId()));
        }
        if (request.initialQuarterId() != null) {
            if (request.initialQuarterId().isBlank()) {
                entity.setInitialQuarter(null);
            } else {
                entity.setInitialQuarter(resolveQuarter(teamKey, request.initialQuarterId()));
            }
        }
        if (request.notes() != null) {
            entity.setNotes(convertNotes(request.notes()));
        }
        if (request.leaderId() != null) {
            if (request.leaderId().isBlank()) {
                entity.setLeaderParticipant(null);
            } else {
                entity.setLeaderParticipant(fetchParticipant(teamKey, request.leaderId()));
            }
        }
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        if (request.participantIds() != null) {
            updateParticipants(teamKey, entity, request.participantIds(), sprints);
        }
        if (request.loads() != null) {
            applyLoads(entity, request.loads(), sprintIndex);
        }
        if (request.allocations() != null) {
            applyAllocations(entity, request.allocations(), sprintIndex);
        }
        if (request.order() != null) {
            reorderTask(teamKey, entity, request.order());
        }
        entity.setUpdatedAt(LocalDate.now());
        taskRepository.flush();
        cleanupUnusedTaskReferenceValues(teamKey);
        TaskHistorySnapshot afterSnapshot = snapshotTask(entity);
        List<TaskHistoryChangeDto> changes = buildTaskUpdateChanges(beforeSnapshot, afterSnapshot);
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                entity.getId(),
                "task.update",
                "Изменена задача",
                changes,
                Map.of(
                    "source", "POST /tasks/update",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, entity);
    }

    @Transactional
    public TaskDto delete(String teamKey, IdRequest request) {
        UUID taskId = UUID.fromString(request.id());
        TaskEntity entity = taskRepository.findWithDetailsById(taskId, teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
        TaskHistorySnapshot beforeSnapshot = snapshotTask(entity);
        int order = entity.getDisplayOrder();
        taskRepository.delete(entity);
        taskRepository.flush();
        cleanupUnusedTaskReferenceValues(teamKey);
        taskRepository.decrementDisplayOrderAfter(teamKey, order);
        List<TaskHistoryChangeDto> changes = buildTaskUpdateChanges(beforeSnapshot, emptyTaskHistorySnapshot());
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                taskId,
                "task.delete",
                "Удалена задача",
                changes,
                Map.of(
                    "source", "POST /tasks/delete",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, entity);
    }

    @Transactional
    public TaskDto upsertAllocation(String teamKey, TaskAllocationRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(request.participantId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
        TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
        BigDecimal beforeDays = allocation != null ? maxOrZero(allocation.getDays()) : BigDecimal.ZERO;
        BigDecimal afterDays = maxOrZero(request.days());

        if (beforeDays.compareTo(afterDays) == 0) {
            return toDto(teamKey, task);
        }

        if (allocation == null) {
            allocation = createTaskAllocation(task, participant, sprint, teamKey);
        }

        if (afterDays.compareTo(BigDecimal.ZERO) == 0) {
            task.getAllocations().removeIf(existing ->
                isSameAllocation(existing, participant.getId(), sprint.getId()));
            taskAllocationRepository.delete(allocation);
        } else {
            allocation.setDays(afterDays);
        }

        recalcLoad(task, sprint);
        task.setUpdatedAt(LocalDate.now());
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        addAllocationHistoryChange(changes, participant, sprint, beforeDays, afterDays);
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                task.getId(),
                "task.allocations.update",
                "Изменена нагрузка задачи",
                changes,
                Map.of(
                    "source", "POST /taskalloc",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, task);
    }

    private int resolveDisplayOrder(String teamKey, Integer requestedOrder) {
        int maxOrder = taskRepository.findMaxDisplayOrder(teamKey);
        if (requestedOrder == null || requestedOrder < 0) {
            return maxOrder + 1;
        }
        int targetOrder = Math.min(requestedOrder, maxOrder + 1);
        taskRepository.incrementDisplayOrderFrom(teamKey, targetOrder);
        return targetOrder;
    }

    private void reorderTask(String teamKey, TaskEntity entity, Integer requestedOrder) {
        int currentOrder = entity.getDisplayOrder();
        int maxOrder = taskRepository.findMaxDisplayOrder(teamKey);
        int targetOrder = requestedOrder != null
            ? Math.max(0, Math.min(requestedOrder, maxOrder))
            : currentOrder;

        if (targetOrder == currentOrder) {
            return;
        }

        UUID taskId = entity.getId();
        if (targetOrder < currentOrder) {
            taskRepository.incrementDisplayOrderRange(taskId, teamKey, targetOrder, currentOrder);
        } else {
            taskRepository.decrementDisplayOrderRange(taskId, teamKey, currentOrder, targetOrder);
        }

        entity.setDisplayOrder(targetOrder);
    }

    @Transactional
    public TaskDto upsertAllocations(String teamKey, TaskAllocationBulkRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(request.participantId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        Map<UUID, SprintEntity> sprints = fetchSprintsForBulk(teamKey, request.allocations());
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        for (Map.Entry<String, BigDecimal> allocationEntry : request.allocations().entrySet()) {
            SprintEntity sprint = resolveSprint(teamKey, sprints, allocationEntry.getKey());
            TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
            TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
            BigDecimal beforeDays = allocation != null ? maxOrZero(allocation.getDays()) : BigDecimal.ZERO;
            BigDecimal afterDays = maxOrZero(allocationEntry.getValue());
            if (beforeDays.compareTo(afterDays) == 0) {
                continue;
            }

            if (allocation == null) {
                allocation = createTaskAllocation(task, participant, sprint, teamKey);
            }

            if (afterDays.compareTo(BigDecimal.ZERO) == 0) {
                task.getAllocations().removeIf(existing ->
                    isSameAllocation(existing, participant.getId(), sprint.getId()));
                taskAllocationRepository.delete(allocation);
            } else {
                allocation.setDays(afterDays);
            }
            addAllocationHistoryChange(changes, participant, sprint, beforeDays, afterDays);
            recalcLoad(task, sprint);
        }
        task.setUpdatedAt(LocalDate.now());
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                task.getId(),
                "task.allocations.bulk.update",
                "Изменена нагрузка задачи",
                changes,
                Map.of(
                    "source", "POST /taskalloc/bulk",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, task);
    }

    @Transactional
    public TaskDto upsertAllocationsMulti(String teamKey, TaskAllocationMultiRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        Map<String, Map<String, BigDecimal>> allocationsByParticipant = request.allocations();
        if (allocationsByParticipant == null || allocationsByParticipant.isEmpty()) {
            return toDto(teamKey, task);
        }
        Map<UUID, SprintEntity> sprints = fetchSprintsForMulti(teamKey, allocationsByParticipant);
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        for (Map.Entry<String, Map<String, BigDecimal>> participantEntry : allocationsByParticipant.entrySet()) {
            String participantId = participantEntry.getKey();
            if (participantId == null || participantId.isBlank()) {
                continue;
            }
            ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(participantId), teamKey)
                .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
            Map<String, BigDecimal> row = participantEntry.getValue();
            if (row == null) {
                continue;
            }
            for (Map.Entry<String, BigDecimal> allocationEntry : row.entrySet()) {
                SprintEntity sprint = resolveSprint(teamKey, sprints, allocationEntry.getKey());
                TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
                BigDecimal beforeDays = allocation != null ? maxOrZero(allocation.getDays()) : BigDecimal.ZERO;
                BigDecimal afterDays = maxOrZero(allocationEntry.getValue());
                if (beforeDays.compareTo(afterDays) == 0) {
                    continue;
                }

                if (allocation == null) {
                    allocation = createTaskAllocation(task, participant, sprint, teamKey);
                }

                if (afterDays.compareTo(BigDecimal.ZERO) == 0) {
                    task.getAllocations().removeIf(existing ->
                        isSameAllocation(existing, participant.getId(), sprint.getId()));
                    taskAllocationRepository.delete(allocation);
                } else {
                    allocation.setDays(afterDays);
                }
                addAllocationHistoryChange(changes, participant, sprint, beforeDays, afterDays);
                recalcLoad(task, sprint);
            }
        }
        task.setUpdatedAt(LocalDate.now());
        if (!changes.isEmpty()) {
            apiHistoryService.logTaskChange(
                teamKey,
                task.getId(),
                "task.allocations.multi.update",
                "Изменена нагрузка задачи",
                changes,
                Map.of(
                    "source", "POST /taskalloc/bulk/multi",
                    "changedFields", changes.size()
                )
            );
        }
        return toDto(teamKey, task);
    }

    @Transactional
    public TaskDto upsertLoad(String teamKey, TaskLoadRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        if (!task.getParticipants().isEmpty() || !task.getAllocations().isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "Прямое редактирование суммарной нагрузки доступно только для задач без участников и распределения"
            );
        }
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        BigDecimal nextDays = maxOrZero(request.days());
        TaskLoadEntity load = taskLoadRepository.findById(id).orElse(null);
        if (nextDays.compareTo(BigDecimal.ZERO) == 0) {
            if (load != null) {
                task.getLoads().removeIf(existing -> isSameLoad(existing, sprint.getId()));
                taskLoadRepository.delete(load);
            }
            task.setUpdatedAt(LocalDate.now());
            return toDto(teamKey, task);
        }
        if (load == null) {
            load = createTaskLoad(task, sprint, teamKey);
        }
        load.setDays(nextDays);
        task.setUpdatedAt(LocalDate.now());
        return toDto(teamKey, task);
    }

    private TaskAllocationEntity createTaskAllocation(
        TaskEntity task,
        ParticipantEntity participant,
        SprintEntity sprint,
        String teamKey
    ) {
        TaskAllocationEntity created = new TaskAllocationEntity();
        created.setId(new TaskAllocationId(task.getId(), participant.getId(), sprint.getId()));
        created.setTask(task);
        created.setParticipant(participant);
        created.setSprint(sprint);
        created.setDays(BigDecimal.ZERO);
        created.setTeamKey(teamKey);
        task.getAllocations().add(created);
        return created;
    }

    private TaskLoadEntity createTaskLoad(TaskEntity task, SprintEntity sprint, String teamKey) {
        TaskLoadEntity created = new TaskLoadEntity();
        created.setId(new TaskLoadId(task.getId(), sprint.getId()));
        created.setTask(task);
        created.setSprint(sprint);
        created.setDays(BigDecimal.ZERO);
        created.setTeamKey(teamKey);
        task.getLoads().add(created);
        return created;
    }

    private boolean isSameAllocation(TaskAllocationEntity allocation, UUID participantId, UUID sprintId) {
        if (allocation == null || allocation.getParticipant() == null || allocation.getSprint() == null) {
            return false;
        }
        UUID currentParticipantId = allocation.getParticipant().getId();
        UUID currentSprintId = allocation.getSprint().getId();
        return Objects.equals(currentParticipantId, participantId)
            && Objects.equals(currentSprintId, sprintId);
    }

    private boolean isSameLoad(TaskLoadEntity load, UUID sprintId) {
        if (load == null || load.getSprint() == null) {
            return false;
        }
        return Objects.equals(load.getSprint().getId(), sprintId);
    }

    private void addAllocationHistoryChange(
        List<TaskHistoryChangeDto> changes,
        ParticipantEntity participant,
        SprintEntity sprint,
        BigDecimal beforeDays,
        BigDecimal afterDays
    ) {
        BigDecimal safeBefore = maxOrZero(beforeDays);
        BigDecimal safeAfter = maxOrZero(afterDays);
        if (safeBefore.compareTo(safeAfter) == 0) {
            return;
        }

        String participantLabel = resolveParticipantHistoryLabel(participant);
        String sprintLabel = resolveSprintHistoryLabel(sprint);
        changes.add(
            new TaskHistoryChangeDto(
                "allocationDays",
                "Нагрузка: " + participantLabel + " / " + sprintLabel,
                safeBefore,
                safeAfter
            )
        );
    }

    private String resolveParticipantHistoryLabel(ParticipantEntity participant) {
        if (participant == null) {
            return "Участник";
        }
        String fullName = participant.getFullName();
        if (fullName != null && !fullName.isBlank()) {
            return fullName.trim();
        }
        return participant.getId() != null ? participant.getId().toString() : "Участник";
    }

    private String resolveSprintHistoryLabel(SprintEntity sprint) {
        if (sprint == null) {
            return "Спринт";
        }
        String name = sprint.getName();
        if (name != null && !name.isBlank()) {
            return name.trim();
        }
        return sprint.getId() != null ? sprint.getId().toString() : "Спринт";
    }

    private void updateParticipants(String teamKey, TaskEntity entity, List<String> participantIds, List<SprintEntity> sprints) {
        List<UUID> orderedIds = participantIds != null
            ? participantIds.stream().filter(id -> id != null && !id.isBlank()).map(UUID::fromString).toList()
            : List.of();
        Set<UUID> newIds = new LinkedHashSet<>(orderedIds);

        Set<UUID> existingIds = entity.getParticipants().stream()
            .map(tp -> tp.getParticipant().getId())
            .collect(Collectors.toSet());
        Set<UUID> removedIds = new HashSet<>(existingIds);
        removedIds.removeAll(newIds);

        entity.getParticipants().removeIf(tp -> !newIds.contains(tp.getParticipant().getId()));

        Map<UUID, TaskParticipantEntity> existing = entity.getParticipants().stream()
            .collect(Collectors.toMap(tp -> tp.getParticipant().getId(), tp -> tp));

        int order = 0;
        for (UUID id : newIds) {
            TaskParticipantEntity link = existing.get(id);
            if (link == null) {
                ParticipantEntity participant = fetchParticipant(teamKey, id.toString());
                link = new TaskParticipantEntity();
                link.setId(new TaskParticipantId(entity.getId(), participant.getId()));
                link.setTask(entity);
                link.setParticipant(participant);
                link.setTeamKey(teamKey);
                entity.getParticipants().add(link);
            }
            link.setDisplayOrder(order++);
        }

        if (!removedIds.isEmpty()) {
            taskJiraIssueRepository.deleteAllByTeamKeyAndTaskIdAndParticipantIdIn(teamKey, entity.getId(), removedIds);
            entity.getAllocations().removeIf(allocation -> removedIds.contains(allocation.getParticipant().getId()));
            recalcAllLoads(entity, sprints);
        }
    }

    private void applyLoads(TaskEntity entity, Map<String, BigDecimal> loads, Map<UUID, SprintEntity> sprints) {
        if (loads == null) {
            return;
        }
        for (Map.Entry<String, BigDecimal> entry : loads.entrySet()) {
            SprintEntity sprint = resolveSprint(entity.getTeamKey(), sprints, entry.getKey());
            TaskLoadId id = new TaskLoadId(entity.getId(), sprint.getId());
            BigDecimal nextDays = maxOrZero(entry.getValue());
            TaskLoadEntity load = taskLoadRepository.findById(id).orElse(null);
            if (nextDays.compareTo(BigDecimal.ZERO) == 0) {
                if (load != null) {
                    entity.getLoads().removeIf(existing -> isSameLoad(existing, sprint.getId()));
                    taskLoadRepository.delete(load);
                }
                continue;
            }
            if (load == null) {
                load = createTaskLoad(entity, sprint, entity.getTeamKey());
            }
            load.setDays(nextDays);
        }
    }

    private void applyAllocations(TaskEntity entity, Map<String, Map<String, BigDecimal>> allocations,
        Map<UUID, SprintEntity> sprints) {
        if (allocations == null) {
            return;
        }
        for (Map.Entry<String, Map<String, BigDecimal>> participantEntry : allocations.entrySet()) {
            if (participantEntry.getValue() == null) {
                continue;
            }
            ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(participantEntry.getKey()), entity.getTeamKey())
                .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
            for (Map.Entry<String, BigDecimal> sprintEntry : participantEntry.getValue().entrySet()) {
                SprintEntity sprint = resolveSprint(entity.getTeamKey(), sprints, sprintEntry.getKey());
                TaskAllocationId id = new TaskAllocationId(entity.getId(), participant.getId(), sprint.getId());
                BigDecimal nextDays = maxOrZero(sprintEntry.getValue());
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
                if (nextDays.compareTo(BigDecimal.ZERO) == 0) {
                    if (allocation != null) {
                        entity.getAllocations().removeIf(existing ->
                            isSameAllocation(existing, participant.getId(), sprint.getId()));
                        taskAllocationRepository.delete(allocation);
                    }
                    recalcLoad(entity, sprint);
                    continue;
                }
                if (allocation == null) {
                    allocation = createTaskAllocation(entity, participant, sprint, entity.getTeamKey());
                }
                allocation.setDays(nextDays);
                recalcLoad(entity, sprint);
            }
        }
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return DEFAULT_STATUS;
        }
        String normalized = status.trim().toLowerCase();
        return ALLOWED_STATUSES.contains(normalized) ? normalized : DEFAULT_STATUS;
    }

    private List<UUID> resolvePlanningQuarterIds(List<String> quarterIds) {
        if (quarterIds == null) {
            return List.of();
        }
        return quarterIds.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .map(UUID::fromString)
            .distinct()
            .toList();
    }

    private List<UUID> resolvePlanningSprintIds(String teamKey, List<String> sprintIds) {
        if (sprintIds == null) {
            return List.of();
        }
        List<UUID> ids = sprintIds.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .map(UUID::fromString)
            .distinct()
            .toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        List<SprintEntity> sprints = sprintRepository.findByTeamKeyAndIdIn(teamKey, ids);
        if (sprints.size() != ids.size()) {
            throw new EntityNotFoundException("One or more planning sprints not found");
        }
        return ids;
    }

    private void updateTaskCustomers(String teamKey, TaskEntity entity, List<String> customerNames) {
        Set<String> newNames = customerNames.stream()
            .filter(name -> name != null && !name.isBlank())
            .map(String::trim)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        entity.getCustomers().clear();

        if (newNames.isEmpty()) {
            return;
        }

        // Find existing customers
        List<TaskCustomerEntity> existing = taskCustomerRepository.findByNamesAndTeamKey(newNames, teamKey);
        Map<String, TaskCustomerEntity> existingByName = existing.stream()
            .collect(Collectors.toMap(TaskCustomerEntity::getName, Function.identity()));

        // Add or create customers
        for (String name : newNames) {
            TaskCustomerEntity customer = existingByName.get(name);
            if (customer == null) {
                customer = new TaskCustomerEntity();
                customer.setName(name);
                customer.setTeamKey(teamKey);
                customer.setCreatedAt(LocalDateTime.now());
                customer = taskCustomerRepository.save(customer);
            }
            entity.getCustomers().add(customer);
        }
        syncLegacyCustomerAndStream(entity);
    }

    private void updateTaskStreams(String teamKey, TaskEntity entity, List<String> streamNames) {
        Set<String> newNames = streamNames.stream()
            .filter(name -> name != null && !name.isBlank())
            .map(String::trim)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        entity.getStreams().clear();

        if (newNames.isEmpty()) {
            return;
        }

        // Find existing streams
        List<TaskStreamEntity> existing = taskStreamRepository.findByNamesAndTeamKey(newNames, teamKey);
        Map<String, TaskStreamEntity> existingByName = existing.stream()
            .collect(Collectors.toMap(TaskStreamEntity::getName, Function.identity()));

        // Add or create streams
        for (String name : newNames) {
            TaskStreamEntity stream = existingByName.get(name);
            if (stream == null) {
                stream = new TaskStreamEntity();
                stream.setName(name);
                stream.setTeamKey(teamKey);
                stream.setCreatedAt(LocalDateTime.now());
                stream = taskStreamRepository.save(stream);
            }
            entity.getStreams().add(stream);
        }
        syncLegacyCustomerAndStream(entity);
    }

    private void cleanupUnusedTaskReferenceValues(String teamKey) {
        List<UUID> unusedStreamIds = taskStreamRepository.findUnusedIdsByTeamKey(teamKey);
        if (!unusedStreamIds.isEmpty()) {
            taskStreamRepository.deleteAllByIdInBatch(unusedStreamIds);
        }
        List<UUID> unusedCustomerIds = taskCustomerRepository.findUnusedIdsByTeamKey(teamKey);
        if (!unusedCustomerIds.isEmpty()) {
            taskCustomerRepository.deleteAllByIdInBatch(unusedCustomerIds);
        }
    }

    private void syncLegacyCustomerAndStream(TaskEntity entity) {
        entity.setCustomer(resolveLegacyScalarValue(entity.getCustomers().stream()
            .map(TaskCustomerEntity::getName)
            .toList()));
        entity.setStream(resolveLegacyScalarValue(entity.getStreams().stream()
            .map(TaskStreamEntity::getName)
            .toList()));
    }

    private String resolveLegacyScalarValue(List<String> values) {
        return values.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .sorted()
            .findFirst()
            .orElse("");
    }

    private void recalcLoad(TaskEntity task, SprintEntity sprint) {
        BigDecimal total = task.getAllocations().stream()
            .filter(a -> a.getSprint().getId().equals(sprint.getId()))
            .map(TaskAllocationEntity::getDays)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = taskLoadRepository.findById(id).orElse(null);
        if (total.compareTo(BigDecimal.ZERO) <= 0) {
            if (load != null) {
                task.getLoads().removeIf(existing -> isSameLoad(existing, sprint.getId()));
                taskLoadRepository.delete(load);
            }
            return;
        }
        if (load == null) {
            load = createTaskLoad(task, sprint, task.getTeamKey());
        }
        load.setDays(total);
    }

    private void recalcAllLoads(TaskEntity task, List<SprintEntity> sprints) {
        for (SprintEntity sprint : sprints) {
            recalcLoad(task, sprint);
        }
    }

    private BigDecimal maxOrZero(BigDecimal value) {
        return value != null ? value.max(BigDecimal.ZERO) : BigDecimal.ZERO;
    }

    private SprintEntity fetchSprint(String teamKey, String sprintId) {
        return sprintRepository.findByIdAndTeamKey(UUID.fromString(sprintId), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
    }

    private Map<UUID, SprintEntity> fetchSprintsForBulk(String teamKey, Map<String, BigDecimal> loads) {
        if (loads == null || loads.isEmpty()) {
            return Map.of();
        }
        Set<UUID> sprintIds = loads.keySet().stream()
            .filter(Objects::nonNull)
            .filter(id -> !id.isBlank())
            .map(UUID::fromString)
            .collect(Collectors.toSet());
        return fetchSprintsByIds(teamKey, sprintIds);
    }

    private Map<UUID, SprintEntity> fetchSprintsForMulti(
        String teamKey,
        Map<String, Map<String, BigDecimal>> loadsByParticipant
    ) {
        if (loadsByParticipant == null || loadsByParticipant.isEmpty()) {
            return Map.of();
        }
        Set<UUID> sprintIds = loadsByParticipant.values().stream()
            .filter(Objects::nonNull)
            .flatMap(row -> row.keySet().stream())
            .filter(Objects::nonNull)
            .filter(id -> !id.isBlank())
            .map(UUID::fromString)
            .collect(Collectors.toSet());
        return fetchSprintsByIds(teamKey, sprintIds);
    }

    private Map<UUID, SprintEntity> fetchSprintsByIds(String teamKey, Set<UUID> sprintIds) {
        if (sprintIds.isEmpty()) {
            return Map.of();
        }
        List<SprintEntity> sprints = sprintRepository.findByTeamKeyAndIdIn(teamKey, sprintIds);
        if (sprints.size() != sprintIds.size()) {
            throw new EntityNotFoundException("Sprint not found");
        }
        return indexSprints(sprints);
    }

    private ParticipantEntity fetchParticipant(String teamKey, String participantId) {
        return participantRepository.findByIdAndTeamKey(UUID.fromString(participantId), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
    }

    private QuarterEntity resolveQuarter(String teamKey, String quarterId) {
        return quarterRepository.findByIdAndTeamKey(UUID.fromString(quarterId), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
    }

    private ReleaseEntity resolveRelease(String teamKey, String releaseDateId) {
        if (releaseDateId == null || releaseDateId.isBlank()) {
            return null;
        }
        return releaseRepository.findByIdAndTeamKey(UUID.fromString(releaseDateId), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Release not found"));
    }

    private List<SprintEntity> fetchAllSprints(String teamKey) {
        return sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey);
    }

    private List<TaskDto> toDtos(String teamKey, List<TaskEntity> tasks) {
        if (tasks.isEmpty()) {
            return List.of();
        }
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, LocalDate> releasePromDates = fetchReleasePromDates(teamKey, tasks);
        Map<UUID, TaskJiraIssues> jiraIssuesByTask =
            fetchJiraIssuesByTask(teamKey, tasks);
        return tasks.stream()
            .map(task -> toDto(teamKey, task, sprints, releasePromDates, jiraIssuesByTask.get(task.getId())))
            .toList();
    }

    private TaskDto toDto(String teamKey, TaskEntity entity) {
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, LocalDate> releasePromDates = fetchReleasePromDates(teamKey, List.of(entity));
        Map<UUID, TaskJiraIssues> jiraIssuesByTask =
            fetchJiraIssuesByTask(teamKey, List.of(entity));
        return toDto(teamKey, entity, sprints, releasePromDates, jiraIssuesByTask.get(entity.getId()));
    }

    private TaskDto toDto(
        String teamKey,
        TaskEntity entity,
        List<SprintEntity> sprints,
        Map<UUID, LocalDate> releasePromDates,
        TaskJiraIssues jiraIssues
    ) {
        entity.setStatus(normalizeStatus(entity.getStatus()));
        LocalDate promDate = resolvePromDate(teamKey, entity, releasePromDates);
        String releaseSprintId = resolveReleaseSprintId(sprints, promDate);
        return DtoMapper.toTaskDto(
            entity,
            releaseSprintId,
            jiraIssues == null ? Map.of() : jiraIssues.participantIssues(),
            jiraIssues == null ? null : jiraIssues.storyIssue()
        );
    }

    private Map<UUID, TaskJiraIssues> fetchJiraIssuesByTask(
        String teamKey,
        List<TaskEntity> tasks
    ) {
        Set<UUID> taskIds = tasks.stream()
            .map(TaskEntity::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (taskIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, TaskJiraIssues> result = new HashMap<>();
        for (TaskJiraIssueEntity entity : taskJiraIssueRepository.findAllByTeamKeyAndTaskIdIn(teamKey, taskIds)) {
            if (entity.getTask() == null || entity.getTask().getId() == null) {
                continue;
            }
            if (!"CREATED".equalsIgnoreCase(entity.getStatus())) {
                continue;
            }
            var dto = DtoMapper.toTaskJiraIssueDto(entity);
            TaskJiraIssues taskIssues = result.computeIfAbsent(entity.getTask().getId(), ignored -> new TaskJiraIssues());
            if ("STORY".equalsIgnoreCase(entity.getIssueScope())) {
                taskIssues.storyIssue(dto);
                continue;
            }
            if (dto.planningSprintId() == null || dto.planningSprintId().isBlank()) {
                continue;
            }
            if (dto.participantId() == null || dto.participantId().isBlank()) {
                continue;
            }
            taskIssues.participantIssues()
                .computeIfAbsent(dto.participantId(), ignored -> new HashMap<>())
                .put(dto.planningSprintId(), dto);
        }
        return result;
    }

    private static final class TaskJiraIssues {
        private final Map<String, Map<String, com.sber.isu.sprints_planning.dto.TaskJiraIssueDto>> participantIssues =
            new HashMap<>();
        private com.sber.isu.sprints_planning.dto.TaskJiraIssueDto storyIssue;

        private Map<String, Map<String, com.sber.isu.sprints_planning.dto.TaskJiraIssueDto>> participantIssues() {
            return participantIssues;
        }

        private com.sber.isu.sprints_planning.dto.TaskJiraIssueDto storyIssue() {
            return storyIssue;
        }

        private void storyIssue(com.sber.isu.sprints_planning.dto.TaskJiraIssueDto value) {
            this.storyIssue = value;
        }
    }

    private Map<UUID, LocalDate> fetchReleasePromDates(String teamKey, List<TaskEntity> tasks) {
        Set<UUID> releaseIds = tasks.stream()
            .map(TaskEntity::getReleaseDate)
            .filter(Objects::nonNull)
            .map(ReleaseEntity::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (releaseIds.isEmpty()) {
            return Map.of();
        }
        return releaseRepository.findByTeamKeyAndIdIn(teamKey, releaseIds).stream()
            .collect(Collectors.toMap(ReleaseEntity::getId, ReleaseEntity::getPromDate));
    }

    private LocalDate resolvePromDate(String teamKey, TaskEntity entity, Map<UUID, LocalDate> releasePromDates) {
        ReleaseEntity release = entity.getReleaseDate();
        if (release == null) {
            return null;
        }
        UUID releaseId = release.getId();
        if (releaseId != null) {
            LocalDate cached = releasePromDates.get(releaseId);
            if (cached != null) {
                return cached;
            }
        }
        LocalDate promDate = release.getPromDate();
        if (promDate != null) {
            return promDate;
        }
        if (releaseId == null) {
            return null;
        }
        return releaseRepository.findByIdAndTeamKey(releaseId, teamKey)
            .map(ReleaseEntity::getPromDate)
            .orElse(null);
    }

    private String resolveReleaseSprintId(List<SprintEntity> sprints, LocalDate releaseDate) {
        if (releaseDate == null) {
            return null;
        }
        return sprints.stream()
            .filter(sprint -> !releaseDate.isBefore(sprint.getStartDate())
                && !releaseDate.isAfter(sprint.getEndDate()))
            .map(sprint -> sprint.getId().toString())
            .findFirst()
            .orElse(null);
    }

    private TaskHistorySnapshot snapshotTask(TaskEntity entity) {
        String releaseDateId = entity.getReleaseDate() != null && entity.getReleaseDate().getId() != null
            ? entity.getReleaseDate().getId().toString()
            : null;
        String initialQuarterId = entity.getInitialQuarter() != null && entity.getInitialQuarter().getId() != null
            ? entity.getInitialQuarter().getId().toString()
            : null;
        String leaderId = entity.getLeaderParticipant() != null && entity.getLeaderParticipant().getId() != null
            ? entity.getLeaderParticipant().getId().toString()
            : null;
        return new TaskHistorySnapshot(
            normalizeString(entity.getTitle()),
            normalizeString(entity.getDescription()),
            normalizeString(entity.getDod()),
            entity.getPriority(),
            normalizeString(entity.getStatus()),
            extractCustomerNames(entity),
            extractStreamNames(entity),
            extractParticipantIds(entity),
            entity.getPlanningQuarterIds() == null ? List.of() : entity.getPlanningQuarterIds().stream().map(UUID::toString).toList(),
            entity.getPlanningSprintIds() == null ? List.of() : entity.getPlanningSprintIds().stream().map(UUID::toString).toList(),
            releaseDateId,
            initialQuarterId,
            leaderId,
            entity.getDisplayOrder(),
            extractNotes(entity)
        );
    }

    private TaskHistorySnapshot emptyTaskHistorySnapshot() {
        return new TaskHistorySnapshot(
            null,
            null,
            null,
            null,
            null,
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            List.of(),
            null,
            null,
            null,
            null,
            Map.of()
        );
    }

    private List<TaskHistoryChangeDto> buildTaskUpdateChanges(TaskHistorySnapshot before, TaskHistorySnapshot after) {
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        addTaskHistoryChange(changes, "title", "Название", before.title(), after.title());
        addTaskHistoryChange(changes, "description", "Описание", before.description(), after.description());
        addTaskHistoryChange(changes, "dod", "DoD", before.dod(), after.dod());
        addTaskHistoryChange(changes, "priority", "Приоритет", before.priority(), after.priority());
        addTaskHistoryChange(changes, "status", "Статус", before.status(), after.status());
        addTaskHistoryChange(changes, "customers", "Заказчики", before.customers(), after.customers());
        addTaskHistoryChange(changes, "streams", "Стримы", before.streams(), after.streams());
        addTaskHistoryChange(changes, "participantIds", "Участники", before.participantIds(), after.participantIds());
        addTaskHistoryChange(changes, "planningQuarterIds", "Кварталы планирования", before.planningQuarterIds(), after.planningQuarterIds());
        addTaskHistoryChange(changes, "planningSprintIds", "Спринты планирования", before.planningSprintIds(), after.planningSprintIds());
        addTaskHistoryChange(changes, "releaseDateId", "Релиз", before.releaseDateId(), after.releaseDateId());
        addTaskHistoryChange(changes, "initialQuarterId", "Квартал создания", before.initialQuarterId(), after.initialQuarterId());
        addTaskHistoryChange(changes, "leaderId", "Лидер", before.leaderId(), after.leaderId());
        addTaskHistoryChange(changes, "order", "Порядок", before.displayOrder(), after.displayOrder());
        addTaskHistoryChange(changes, "notes", "Заметки", before.notes(), after.notes());
        return changes;
    }

    private void addTaskHistoryChange(
        List<TaskHistoryChangeDto> changes,
        String field,
        String label,
        Object before,
        Object after
    ) {
        if (Objects.equals(before, after)) {
            return;
        }
        changes.add(new TaskHistoryChangeDto(field, label, before, after));
    }

    private List<String> extractCustomerNames(TaskEntity entity) {
        if (entity.getCustomers() == null || entity.getCustomers().isEmpty()) {
            return List.of();
        }
        return entity.getCustomers().stream()
            .map(TaskCustomerEntity::getName)
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .toList();
    }

    private List<String> extractStreamNames(TaskEntity entity) {
        if (entity.getStreams() == null || entity.getStreams().isEmpty()) {
            return List.of();
        }
        return entity.getStreams().stream()
            .map(TaskStreamEntity::getName)
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .sorted(String.CASE_INSENSITIVE_ORDER)
            .toList();
    }

    private List<String> extractParticipantIds(TaskEntity entity) {
        if (entity.getParticipants() == null || entity.getParticipants().isEmpty()) {
            return List.of();
        }
        return entity.getParticipants().stream()
            .sorted(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder))
            .map(TaskParticipantEntity::getParticipant)
            .filter(Objects::nonNull)
            .map(ParticipantEntity::getId)
            .filter(Objects::nonNull)
            .map(UUID::toString)
            .toList();
    }

    private Map<String, String> extractNotes(TaskEntity entity) {
        if (entity.getNotes() == null || entity.getNotes().isEmpty()) {
            return Map.of();
        }
        return entity.getNotes().entrySet().stream()
            .filter(entry -> entry.getKey() != null)
            .sorted(Map.Entry.comparingByKey())
            .collect(
                Collectors.toMap(
                    entry -> entry.getKey().toString(),
                    Map.Entry::getValue,
                    (left, right) -> right,
                    LinkedHashMap::new
                )
            );
    }

    private String normalizeString(String value) {
        return value == null ? null : value.trim();
    }

    private Map<UUID, SprintEntity> indexSprints(List<SprintEntity> sprints) {
        return sprints.stream().collect(Collectors.toMap(SprintEntity::getId, Function.identity()));
    }

    private SprintEntity resolveSprint(String teamKey, Map<UUID, SprintEntity> sprintIndex, String sprintId) {
        if (sprintIndex.isEmpty()) {
            return fetchSprint(teamKey, sprintId);
        }
        return resolveSprint(sprintIndex, UUID.fromString(sprintId));
    }

    private SprintEntity resolveSprint(Map<UUID, SprintEntity> sprintIndex, UUID sprintId) {
        SprintEntity sprint = sprintIndex.get(sprintId);
        if (sprint == null) {
            throw new EntityNotFoundException("Sprint not found");
        }
        return sprint;
    }

    private Map<UUID, String> convertNotes(Map<String, String> notes) {
        if (notes == null) {
            return null;
        }
        Map<UUID, String> map = new HashMap<>();
        notes.forEach((key, value) -> {
            if (key != null && !key.isBlank()) {
                map.put(UUID.fromString(key), value);
            }
        });
        return map;
    }

    private record TaskHistorySnapshot(
        String title,
        String description,
        String dod,
        Short priority,
        String status,
        List<String> customers,
        List<String> streams,
        List<String> participantIds,
        List<String> planningQuarterIds,
        List<String> planningSprintIds,
        String releaseDateId,
        String initialQuarterId,
        String leaderId,
        Integer displayOrder,
        Map<String, String> notes
    ) {
    }

}
