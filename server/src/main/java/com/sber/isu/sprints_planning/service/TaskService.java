package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskLoadRepository taskLoadRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;

    public TaskService(TaskRepository taskRepository,
        TaskLoadRepository taskLoadRepository,
        TaskAllocationRepository taskAllocationRepository,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository) {
        this.taskRepository = taskRepository;
        this.taskLoadRepository = taskLoadRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
    }

    @Transactional
    public List<TaskDto> findAll(String teamKey, TaskFilter filter) {
        return findFilteredTasks(teamKey, filter);
    }

    @Transactional
    public Page<TaskDto> findPage(String teamKey, TaskFilter filter, Integer page, Integer size) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        List<TaskDto> filtered = findFilteredTasks(teamKey, effectiveFilter);
        if (page == null || size == null) {
            return new PageImpl<>(filtered);
        }
        int safePage = Math.max(page, 0);
        int safeSize = Math.max(size, 1);
        int fromIndex = Math.min((int) ((long) safePage * safeSize), filtered.size());
        int toIndex = Math.min(fromIndex + safeSize, filtered.size());
        List<TaskDto> content = filtered.subList(fromIndex, toIndex);
        return new PageImpl<>(content, Pageable.ofSize(safeSize).withPage(safePage), filtered.size());
    }

    public TaskDto findById(String teamKey, UUID id) {
        TaskEntity entity = taskRepository.findWithDetailsById(id, teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
        entity.setStatus(normalizeStatus(entity.getStatus()));
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        ensureLoadsForSprints(entity, sprints);
        return DtoMapper.toTaskDto(entity);
    }

    private List<TaskDto> findFilteredTasks(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        Set<UUID> quarterIds = effectiveFilter.quarterIds().isEmpty()
            ? Set.of(UUID.fromString("00000000-0000-0000-0000-000000000000"))
            : effectiveFilter.quarterIds();
        Set<Short> priorities = effectiveFilter.priorities().isEmpty()
            ? Set.of((short) -1)
            : effectiveFilter.priorities();
        Set<String> statuses = effectiveFilter.statuses().isEmpty()
            ? Set.of("__none__")
            : effectiveFilter.statuses();
        Set<UUID> participantIds = effectiveFilter.participantIds().isEmpty()
            ? Set.of(UUID.fromString("00000000-0000-0000-0000-000000000000"))
            : effectiveFilter.participantIds();
        Set<String> roles = effectiveFilter.roles().isEmpty()
            ? Set.of("__none__")
            : effectiveFilter.roles();
        Set<String> userStreams = effectiveFilter.userStreams().isEmpty()
            ? Set.of("__none__")
            : effectiveFilter.userStreams();

        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        List<TaskEntity> tasks = taskRepository.findAllByTeamKeyWithFilters(
            teamKey,
            quarterIds,
            effectiveFilter.quarterIds().isEmpty(),
            priorities,
            effectiveFilter.priorities().isEmpty(),
            statuses,
            effectiveFilter.statuses().isEmpty(),
            effectiveFilter.releaseDate(),
            effectiveFilter.stream(),
            participantIds,
            effectiveFilter.participantIds().isEmpty(),
            roles,
            effectiveFilter.roles().isEmpty(),
            userStreams,
            effectiveFilter.userStreams().isEmpty()
        );

        tasks.forEach(task -> {
            task.setStatus(normalizeStatus(task.getStatus()));
            ensureLoadsForSprints(task, sprints);
        });

        return tasks.stream()
            .filter(task -> matchesFilters(task, effectiveFilter, sprintIndex))
            .map(DtoMapper::toTaskDto)
            .toList();
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
        entity.setCustomer(request.customer() != null ? request.customer() : "");
        entity.setStream(request.stream() != null ? request.stream() : "");
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setNotes(convertNotes(request.notes()));
        if (request.releaseDate() != null) {
            entity.setReleaseDate(request.releaseDate());
        }
        if (request.releaseSprintId() != null && !request.releaseSprintId().isBlank()) {
            entity.setReleaseSprint(fetchSprint(teamKey, request.releaseSprintId()));
        }
        if (request.leaderId() != null && !request.leaderId().isBlank()) {
            entity.setLeaderParticipant(fetchParticipant(teamKey, request.leaderId()));
        }
        entity.setTeamKey(teamKey);
        entity.setDisplayOrder(resolveDisplayOrder(teamKey, request.order()));
        TaskEntity saved = taskRepository.save(entity);
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        updateParticipants(teamKey, saved, request.participantIds(), sprints);
        applyLoads(saved, request.loads(), sprintIndex);
        applyAllocations(saved, request.allocations(), sprintIndex);
        ensureLoadsForSprints(saved, sprints);
        return DtoMapper.toTaskDto(saved);
    }

    @Transactional
    public TaskDto update(String teamKey, TaskUpdateRequest request) {
        TaskEntity entity = taskRepository.findWithDetailsById(UUID.fromString(request.id()), teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
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
        if (request.customer() != null) {
            entity.setCustomer(request.customer());
        }
        if (request.stream() != null) {
            entity.setStream(request.stream());
        }
        if (request.releaseDate() != null) {
            entity.setReleaseDate(request.releaseDate());
        }
        if (request.releaseSprintId() != null) {
            if (request.releaseSprintId().isBlank()) {
                entity.setReleaseSprint(null);
            } else {
                entity.setReleaseSprint(fetchSprint(teamKey, request.releaseSprintId()));
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
        ensureLoadsForSprints(entity, sprints);
        return DtoMapper.toTaskDto(entity);
    }

    @Transactional
    public TaskDto delete(String teamKey, IdRequest request) {
        TaskEntity entity = taskRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        taskRepository.delete(entity);
        return DtoMapper.toTaskDto(entity);
    }

    @Transactional
    public TaskDto upsertAllocation(String teamKey, TaskAllocationRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(request.participantId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id)
                    .orElseGet(() -> {
                        TaskAllocationEntity created = new TaskAllocationEntity();
                        created.setId(id);
                        created.setTask(task);
                        created.setParticipant(participant);
                        created.setSprint(sprint);
                        created.setDays(BigDecimal.ZERO);
                        created.setTeamKey(teamKey);
                        task.getAllocations().add(created);
                        return created;
                    });
        allocation.setDays(maxOrZero(request.days()));
        recalcLoad(task, sprint);
        task.setUpdatedAt(LocalDate.now());
        ensureLoadsForSprints(task, fetchAllSprints(teamKey));
        return DtoMapper.toTaskDto(task);
    }

    private int resolveDisplayOrder(String teamKey, Integer requestedOrder) {
        if (requestedOrder != null && requestedOrder >= 0) {
            return requestedOrder;
        }
        return taskRepository.findMaxDisplayOrder(teamKey) + 1;
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
        for (Map.Entry<String, BigDecimal> allocationEntry : request.allocations().entrySet()) {
            SprintEntity sprint = resolveSprint(teamKey, sprints, allocationEntry.getKey());
            TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
            TaskAllocationEntity allocation = taskAllocationRepository.findById(id)
                .orElseGet(() -> {
                    TaskAllocationEntity created = new TaskAllocationEntity();
                    created.setId(id);
                    created.setTask(task);
                    created.setParticipant(participant);
                    created.setSprint(sprint);
                    created.setDays(BigDecimal.ZERO);
                    task.getAllocations().add(created);
                    return created;
                });
            allocation.setDays(maxOrZero(allocationEntry.getValue()));
            recalcLoad(task, sprint);
        }
        task.setUpdatedAt(LocalDate.now());
        ensureLoadsForSprints(task, fetchAllSprints(teamKey));
        return DtoMapper.toTaskDto(task);
    }

    @Transactional
    public TaskDto upsertLoad(String teamKey, TaskLoadRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = taskLoadRepository.findById(id)
            .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(task);
                created.setSprint(sprint);
                created.setDays(BigDecimal.ZERO);
                created.setTeamKey(teamKey);
                task.getLoads().add(created);
                return created;
            });
        load.setDays(maxOrZero(request.days()));
        task.setUpdatedAt(LocalDate.now());
        ensureLoadsForSprints(task, fetchAllSprints(teamKey));
        return DtoMapper.toTaskDto(task);
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
            TaskLoadEntity load = taskLoadRepository.findById(id)
                .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(entity);
                created.setSprint(sprint);
                created.setDays(BigDecimal.ZERO);
                created.setTeamKey(entity.getTeamKey());
                entity.getLoads().add(created);
                return created;
            });
            load.setDays(maxOrZero(entry.getValue()));
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
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id)
                    .orElseGet(() -> {
                        TaskAllocationEntity created = new TaskAllocationEntity();
                        created.setId(id);
                        created.setTask(entity);
                        created.setParticipant(participant);
                        created.setSprint(sprint);
                        created.setDays(BigDecimal.ZERO);
                        created.setTeamKey(entity.getTeamKey());
                        entity.getAllocations().add(created);
                        return created;
                    });
                allocation.setDays(maxOrZero(sprintEntry.getValue()));
                recalcLoad(entity, sprint);
            }
        }
    }

    private void ensureLoadsForSprints(TaskEntity entity, List<SprintEntity> sprints) {
        Set<UUID> existing = entity.getLoads().stream()
            .map(load -> load.getSprint().getId())
            .collect(Collectors.toSet());
        for (SprintEntity sprint : sprints) {
            if (!existing.contains(sprint.getId())) {
                TaskLoadId id = new TaskLoadId(entity.getId(), sprint.getId());
                TaskLoadEntity load = taskLoadRepository.findById(id)
                    .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(entity);
                created.setSprint(sprint);
                created.setDays(BigDecimal.ZERO);
                created.setTeamKey(entity.getTeamKey());
                entity.getLoads().add(created);
                return created;
            });
                load.setDays(maxOrZero(load.getDays()));
                existing.add(sprint.getId());
            }
        }
    }

    private boolean matchesFilters(TaskEntity task, TaskFilter filter, Map<UUID, SprintEntity> sprintIndex) {
        if (!filter.participantIds().isEmpty()) {
            boolean hasSelectedParticipant = task.getParticipants().stream()
                .map(TaskParticipantEntity::getParticipant)
                .filter(Objects::nonNull)
                .map(ParticipantEntity::getId)
                .anyMatch(filter.participantIds()::contains);

            if (!hasSelectedParticipant) {
                return false;
            }
        }

        if (!filter.roles().isEmpty()) {
            boolean hasRole = task.getParticipants().stream()
                .map(TaskParticipantEntity::getParticipant)
                .filter(Objects::nonNull)
                .map(ParticipantEntity::getRole)
                .filter(Objects::nonNull)
                .map(role -> role.trim().toLowerCase())
                .anyMatch(filter.roles()::contains);

            if (!hasRole) {
                return false;
            }
        }

        if (!filter.userStreams().isEmpty()) {
            boolean hasUserStream = task.getParticipants().stream()
                .map(TaskParticipantEntity::getParticipant)
                .filter(Objects::nonNull)
                .flatMap(participant -> {
                    Set<String> userStreams = participant.getUserStreams();
                    if (userStreams == null) {
                        return Stream.empty();
                    }
                    return userStreams.stream();
                })
                .filter(Objects::nonNull)
                .map(value -> value.trim().toLowerCase())
                .filter(value -> !value.isEmpty())
                .anyMatch(filter.userStreams()::contains);

            if (!hasUserStream) {
                return false;
            }
        }

        if (!filter.priorities().isEmpty() && !filter.priorities().contains(task.getPriority())) {
            return false;
        }

        if (filter.releaseDate() != null) {
            LocalDate releaseDate = task.getReleaseDate();
            if (releaseDate == null || !filter.releaseDate().equals(releaseDate)) {
                return false;
            }
        }

        if (filter.stream() != null) {
            String taskStream = task.getStream() == null ? "" : task.getStream().toLowerCase();
            if (!taskStream.contains(filter.stream())) {
                return false;
            }
        }

        if (!filter.quarterIds().isEmpty()) {
            Set<UUID> quarters = deriveTaskQuarters(task, sprintIndex);
            if (!quarters.isEmpty() && quarters.stream().noneMatch(filter.quarterIds()::contains)) {
                return false;
            }
        }

        if (!filter.statuses().isEmpty()) {
            String taskStatus = normalizeStatus(task.getStatus());
            if (!filter.statuses().contains(taskStatus)) {
                return false;
            }
        }

        return true;
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "inprogress";
        }
        return status.trim().toLowerCase();
    }

    private Set<UUID> deriveTaskQuarters(TaskEntity task, Map<UUID, SprintEntity> sprintIndex) {
        Set<UUID> quarters = new LinkedHashSet<>();

        for (TaskAllocationEntity allocation : task.getAllocations()) {
            SprintEntity sprint = resolveSprint(sprintIndex, allocation.getSprint().getId());
            quarters.add(sprint.getQuarter().getId());
        }

        for (TaskLoadEntity load : task.getLoads()) {
            if (load.getDays() != null && load.getDays().compareTo(BigDecimal.ZERO) > 0) {
                SprintEntity sprint = resolveSprint(sprintIndex, load.getSprint().getId());
                quarters.add(sprint.getQuarter().getId());
            }
        }

        return quarters;
    }

    private void recalcLoad(TaskEntity task, SprintEntity sprint) {
        BigDecimal total = task.getAllocations().stream()
            .filter(a -> a.getSprint().getId().equals(sprint.getId()))
            .map(TaskAllocationEntity::getDays)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = taskLoadRepository.findById(id)
            .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(task);
                created.setSprint(sprint);
                created.setDays(BigDecimal.ZERO);
                created.setTeamKey(task.getTeamKey());
                task.getLoads().add(created);
                return created;
            });
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

    private List<SprintEntity> fetchAllSprints(String teamKey) {
        return sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey);
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
}
