package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationMultiRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.dto.request.TaskUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationId;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskLoadId;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantId;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
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
import org.springframework.stereotype.Service;

@Service
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskLoadRepository taskLoadRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final ReleaseRepository releaseRepository;

    public TaskService(TaskRepository taskRepository,
        TaskLoadRepository taskLoadRepository,
        TaskAllocationRepository taskAllocationRepository,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        ReleaseRepository releaseRepository) {
        this.taskRepository = taskRepository;
        this.taskLoadRepository = taskLoadRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.releaseRepository = releaseRepository;
    }

    @Transactional
    public List<TaskDto> findAll(String teamKey, TaskFilter filter) {
        return findFilteredTasks(teamKey, filter);
    }

    @Transactional
    public Page<TaskDto> findPage(String teamKey, TaskFilter filter, Integer page, Integer size) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        if (page == null && size == null) {
            List<TaskEntity> tasks = taskRepository.findFilteredWithDetails(teamKey, effectiveFilter);
            List<TaskDto> content = toDtos(teamKey, tasks);
            return new PageImpl<>(content);
        }
        int safePage = page == null ? 0 : Math.max(page, 0);
        int safeSize = size == null ? 20 : Math.max(size, 1);
        Page<TaskEntity> filtered = taskRepository.findFilteredPageWithDetails(teamKey, effectiveFilter, safePage, safeSize);
        List<TaskDto> content = toDtos(teamKey, filtered.getContent());
        return new PageImpl<>(content, filtered.getPageable(), filtered.getTotalElements());
    }

    private List<TaskDto> toDtos(String teamKey, List<TaskEntity> tasks) {
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return tasks.stream()
            .map(task -> toDto(task, sprints))
            .toList();
    }

    public TaskDto findById(String teamKey, UUID id) {
        TaskEntity entity = taskRepository.findWithDetailsById(id, teamKey);
        if (entity == null) {
            throw new EntityNotFoundException("Task not found");
        }
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return toDto(entity, sprints);
    }

    private List<TaskDto> findFilteredTasks(String teamKey, TaskFilter filter) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        List<TaskEntity> tasks = taskRepository.findFilteredWithDetails(teamKey, effectiveFilter);
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return tasks.stream()
            .map(task -> toDto(task, sprints))
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
        if (request.releaseDateId() != null) {
            entity.setReleaseDate(resolveRelease(teamKey, request.releaseDateId()));
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
        return toDto(saved, sprints);
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
        if (request.releaseDateId() != null) {
            entity.setReleaseDate(resolveRelease(teamKey, request.releaseDateId()));
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
        return toDto(entity, sprints);
    }

    @Transactional
    public TaskDto delete(String teamKey, IdRequest request) {
        TaskEntity entity = taskRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        int order = entity.getDisplayOrder();
        taskRepository.delete(entity);
        taskRepository.decrementDisplayOrderAfter(teamKey, order);
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return toDto(entity, sprints);
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
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return toDto(task, sprints);
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
        List<SprintEntity> sprintList = fetchAllSprints(teamKey);
        return toDto(task, sprintList);
    }

    @Transactional
    public TaskDto upsertAllocationsMulti(String teamKey, TaskAllocationMultiRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKey(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        Map<String, Map<String, BigDecimal>> allocationsByParticipant = request.allocations();
        if (allocationsByParticipant == null || allocationsByParticipant.isEmpty()) {
            List<SprintEntity> sprintList = fetchAllSprints(teamKey);
            return toDto(task, sprintList);
        }
        Map<UUID, SprintEntity> sprints = fetchSprintsForMulti(teamKey, allocationsByParticipant);
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
        }
        task.setUpdatedAt(LocalDate.now());
        List<SprintEntity> sprintList = fetchAllSprints(teamKey);
        return toDto(task, sprintList);
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
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        return toDto(task, sprints);
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

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "inprogress";
        }
        return status.trim().toLowerCase();
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

    private TaskDto toDto(TaskEntity entity, List<SprintEntity> sprints) {
        entity.setStatus(normalizeStatus(entity.getStatus()));
        String releaseSprintId = resolveReleaseSprintId(entity.getReleaseDate(), sprints);
        return DtoMapper.toTaskDto(entity, releaseSprintId);
    }

    private String resolveReleaseSprintId(ReleaseEntity release, List<SprintEntity> sprints) {
        if (release == null || release.getPromDate() == null) {
            return null;
        }
        LocalDate releaseDate = release.getPromDate();
        for (SprintEntity sprint : sprints) {
            if (!releaseDate.isBefore(sprint.getStartDate()) && !releaseDate.isAfter(sprint.getEndDate())) {
                return sprint.getId().toString();
            }
        }
        return null;
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
