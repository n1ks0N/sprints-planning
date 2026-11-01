package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskAllocationCellDto;
import com.sber.isu.sprints_planning.dto.TaskAllocationsUpdateDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryChangeDto;
import com.sber.isu.sprints_planning.dto.TaskParticipantRemoveDto;
import com.sber.isu.sprints_planning.dto.TaskParticipantReplaceDto;
import com.sber.isu.sprints_planning.dto.TaskParticipantsUpdateDto;
import com.sber.isu.sprints_planning.dto.ParticipantWorkloadParticipantDto;
import com.sber.isu.sprints_planning.dto.ParticipantWorkloadRowDto;
import com.sber.isu.sprints_planning.dto.ParticipantWorkloadTaskDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationMultiRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationChangeRequest;
import com.sber.isu.sprints_planning.dto.request.TaskAllocationsSetRequest;
import com.sber.isu.sprints_planning.dto.request.TaskCreateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskJiraLinksUpdateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskLoadRequest;
import com.sber.isu.sprints_planning.dto.request.TaskParticipantAddRequest;
import com.sber.isu.sprints_planning.dto.request.TaskParticipantJiraLinkUpdateRequest;
import com.sber.isu.sprints_planning.dto.request.TaskParticipantReplaceRequest;
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
import com.sber.isu.sprints_planning.repository.ParticipantWorkloadTaskFlatRow;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.TaskCustomerRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadRepository;
import com.sber.isu.sprints_planning.repository.TaskLoadValueProjection;
import com.sber.isu.sprints_planning.repository.TaskParticipantRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.repository.TaskStreamRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import java.util.ArrayList;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Collection;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import java.math.RoundingMode;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskService {

    private ReleaseService releaseService;
    @org.springframework.beans.factory.annotation.Autowired
    public void setReleaseService(ReleaseService releaseService) { this.releaseService = releaseService; }

    private static final String DEFAULT_STATUS = "inprogress";
    private static final String ISSUE_SCOPE_STORY = "STORY";
    private static final String ISSUE_SCOPE_PARTICIPANT = "PARTICIPANT";
    private static final String JIRA_LINK_STATUS_CREATED = "CREATED";
    private static final String UNKNOWN_JIRA_ISSUE_ID = "UNKNOWN";
    private static final String JIRA_PUBLIC_BASE_URL = "https://jira.sberbank.ru";
    private static final Pattern JIRA_KEY_PATTERN = Pattern.compile("([A-Za-z][A-Za-z0-9]+-\\d+)");
    private static final Set<String> ALLOWED_STATUSES = Set.of(
        "inprogress",
        "done",
        "canceled",
        "backlog"
    );
    private final TaskRepository taskRepository;
    private final TaskParticipantRepository taskParticipantRepository;
    private final TaskLoadRepository taskLoadRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final EntityManager entityManager;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final QuarterRepository quarterRepository;
    private final ReleaseRepository releaseRepository;
    private final TaskStreamRepository taskStreamRepository;
    private final TaskCustomerRepository taskCustomerRepository;
    private final TaskJiraIssueRepository taskJiraIssueRepository;
    private final ApiHistoryService apiHistoryService;

    public TaskService(TaskRepository taskRepository,
        TaskParticipantRepository taskParticipantRepository,
        TaskLoadRepository taskLoadRepository,
        TaskAllocationRepository taskAllocationRepository,
        EntityManager entityManager,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        QuarterRepository quarterRepository,
        ReleaseRepository releaseRepository,
        TaskStreamRepository taskStreamRepository,
        TaskCustomerRepository taskCustomerRepository,
        TaskJiraIssueRepository taskJiraIssueRepository,
        ApiHistoryService apiHistoryService) {
        this.taskRepository = taskRepository;
        this.taskParticipantRepository = taskParticipantRepository;
        this.taskLoadRepository = taskLoadRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.entityManager = entityManager;
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
    public TaskParticipantsUpdateDto addParticipant(
        String teamKey,
        UUID taskId,
        TaskParticipantAddRequest request
    ) {
        UUID participantId = UUID.fromString(request.participantId());
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        List<UUID> previousParticipantIds = taskParticipantRepository.findParticipantIds(taskId, teamKey);
        if (previousParticipantIds.contains(participantId)) {
            return new TaskParticipantsUpdateDto(
                taskId.toString(),
                previousParticipantIds.stream().map(UUID::toString).toList(),
                false,
                task.getUpdatedAt()
            );
        }

        ParticipantEntity participant = participantRepository.findByIdAndTeamKey(participantId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        requireActiveParticipant(participant);
        TaskParticipantEntity link = new TaskParticipantEntity();
        link.setId(new TaskParticipantId(taskId, participantId));
        link.setTask(task);
        link.setParticipant(participant);
        link.setDisplayOrder(taskParticipantRepository.findMaxDisplayOrder(taskId, teamKey) + 1);
        link.setTeamKey(teamKey);
        taskParticipantRepository.save(link);

        List<String> participantIds = new ArrayList<>(previousParticipantIds.size() + 1);
        previousParticipantIds.stream().map(UUID::toString).forEach(participantIds::add);
        participantIds.add(participantId.toString());
        task.setUpdatedAt(LocalDate.now());
        apiHistoryService.logTaskChange(
            teamKey,
            taskId,
            "task.update",
            "Изменена задача",
            List.of(new TaskHistoryChangeDto(
                "participantIds",
                "Участники",
                previousParticipantIds.stream().map(UUID::toString).toList(),
                participantIds
            )),
            Map.of(
                "source", "POST /tasks/{id}/participants",
                "changedFields", 1
            )
        );

        return new TaskParticipantsUpdateDto(taskId.toString(), participantIds, true, task.getUpdatedAt());
    }

    @Transactional
    public TaskParticipantRemoveDto removeParticipant(String teamKey, UUID taskId, UUID participantId) {
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        List<String> previousParticipantIds = taskParticipantRepository.findParticipantIds(taskId, teamKey).stream()
            .map(UUID::toString)
            .toList();
        String participantIdValue = participantId.toString();
        String leaderId = task.getLeaderParticipant() == null
            ? null
            : task.getLeaderParticipant().getId().toString();

        if (!previousParticipantIds.contains(participantIdValue)) {
            return new TaskParticipantRemoveDto(
                taskId.toString(),
                previousParticipantIds,
                List.of(),
                Map.of(),
                leaderId,
                false,
                task.getUpdatedAt()
            );
        }

        List<UUID> affectedSprintIds = taskAllocationRepository.findSprintIdsForParticipant(
            taskId,
            participantId,
            teamKey
        );
        taskJiraIssueRepository.deleteForParticipant(teamKey, taskId, participantId);
        taskAllocationRepository.deleteForParticipant(taskId, participantId, teamKey);
        taskParticipantRepository.deleteForParticipant(taskId, participantId, teamKey);

        Map<String, BigDecimal> recalculatedLoads = Map.of();
        if (!affectedSprintIds.isEmpty()) {
            Map<UUID, SprintEntity> affectedSprints = fetchSprintsByIds(
                teamKey,
                new LinkedHashSet<>(affectedSprintIds)
            );
            recalculatedLoads = rebuildLoadsWithJpa(task, teamKey, affectedSprintIds, affectedSprints);
        }

        boolean leaderCleared = Objects.equals(leaderId, participantIdValue);
        if (leaderCleared) {
            task.setLeaderParticipant(null);
            leaderId = null;
        }
        task.setUpdatedAt(LocalDate.now());

        List<String> participantIds = previousParticipantIds.stream()
            .filter(id -> !id.equals(participantIdValue))
            .toList();
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        changes.add(new TaskHistoryChangeDto(
            "participantIds",
            "Участники",
            previousParticipantIds,
            participantIds
        ));
        if (leaderCleared) {
            changes.add(new TaskHistoryChangeDto("leaderId", "Лидер", participantIdValue, null));
        }
        apiHistoryService.logTaskChange(
            teamKey,
            taskId,
            "task.update",
            "Изменена задача",
            changes,
            Map.of(
                "source", "DELETE /tasks/{taskId}/participants/{participantId}",
                "changedFields", changes.size()
            )
        );

        return new TaskParticipantRemoveDto(
            taskId.toString(),
            participantIds,
            affectedSprintIds.stream().map(UUID::toString).toList(),
            recalculatedLoads,
            leaderId,
            true,
            task.getUpdatedAt()
        );
    }

    @Transactional
    public TaskParticipantReplaceDto replaceParticipant(
        String teamKey,
        UUID taskId,
        UUID fromParticipantId,
        TaskParticipantReplaceRequest request
    ) {
        UUID toParticipantId = UUID.fromString(request.participantId());
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        List<UUID> previousParticipantIds = taskParticipantRepository.findParticipantIds(taskId, teamKey);
        String leaderId = task.getLeaderParticipant() == null
            ? null
            : task.getLeaderParticipant().getId().toString();

        if (!previousParticipantIds.contains(fromParticipantId)) {
            return new TaskParticipantReplaceDto(
                taskId.toString(),
                previousParticipantIds.stream().map(UUID::toString).toList(),
                fromParticipantId.toString(),
                toParticipantId.toString(),
                leaderId,
                false,
                task.getUpdatedAt()
            );
        }
        if (fromParticipantId.equals(toParticipantId)) {
            return new TaskParticipantReplaceDto(
                taskId.toString(),
                previousParticipantIds.stream().map(UUID::toString).toList(),
                fromParticipantId.toString(),
                toParticipantId.toString(),
                leaderId,
                false,
                task.getUpdatedAt()
            );
        }
        if (previousParticipantIds.contains(toParticipantId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Participant is already assigned to task");
        }

        ParticipantEntity replacement = participantRepository.findByIdAndTeamKey(toParticipantId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        requireActiveParticipant(replacement);
        TaskParticipantEntity previousLink = taskParticipantRepository.findById(
            new TaskParticipantId(taskId, fromParticipantId)
        ).orElseThrow(() -> new EntityNotFoundException("Task participant not found"));
        List<TaskAllocationEntity> previousAllocations = taskAllocationRepository.findEntitiesForParticipant(
            taskId,
            fromParticipantId,
            teamKey
        );
        if (taskAllocationRepository.existsByTaskIdAndParticipantIdAndTeamKey(
            taskId,
            toParticipantId,
            teamKey
        )) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Replacement participant already has task allocations");
        }

        taskJiraIssueRepository.deleteForParticipant(teamKey, taskId, fromParticipantId);
        if (!previousAllocations.isEmpty()) {
            taskAllocationRepository.deleteForParticipant(taskId, fromParticipantId, teamKey);
        }
        taskParticipantRepository.delete(previousLink);
        taskParticipantRepository.flush();

        TaskParticipantEntity replacementLink = new TaskParticipantEntity();
        replacementLink.setId(new TaskParticipantId(taskId, toParticipantId));
        replacementLink.setTask(task);
        replacementLink.setParticipant(replacement);
        replacementLink.setDisplayOrder(previousLink.getDisplayOrder());
        replacementLink.setTeamKey(teamKey);
        taskParticipantRepository.save(replacementLink);

        if (!previousAllocations.isEmpty()) {
            previousAllocations.stream()
                .map(allocation -> newTaskAllocation(
                    task,
                    replacement,
                    allocation.getSprint(),
                    allocation.getDays(),
                    teamKey
                ))
                .forEach(entityManager::persist);
        }

        boolean leaderReplaced = Objects.equals(leaderId, fromParticipantId.toString());
        if (leaderReplaced) {
            task.setLeaderParticipant(replacement);
            leaderId = toParticipantId.toString();
        }
        task.setUpdatedAt(LocalDate.now());

        List<String> participantIds = previousParticipantIds.stream()
            .map(id -> id.equals(fromParticipantId) ? toParticipantId.toString() : id.toString())
            .toList();
        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        changes.add(new TaskHistoryChangeDto(
            "participantIds",
            "Участники",
            previousParticipantIds.stream().map(UUID::toString).toList(),
            participantIds
        ));
        if (leaderReplaced) {
            changes.add(new TaskHistoryChangeDto(
                "leaderId",
                "Лидер",
                fromParticipantId.toString(),
                toParticipantId.toString()
            ));
        }
        apiHistoryService.logTaskChange(
            teamKey,
            taskId,
            "task.update",
            "Изменена задача",
            changes,
            Map.of(
                "source", "PUT /tasks/{taskId}/participants/{participantId}",
                "changedFields", changes.size()
            )
        );

        return new TaskParticipantReplaceDto(
            taskId.toString(),
            participantIds,
            fromParticipantId.toString(),
            toParticipantId.toString(),
            leaderId,
            true,
            task.getUpdatedAt()
        );
    }

    @Transactional
    public TaskAllocationsUpdateDto setAllocations(
        String teamKey,
        UUID taskId,
        TaskAllocationsSetRequest request
    ) {
        LinkedHashMap<AllocationCellKey, BigDecimal> requestedValues = new LinkedHashMap<>();
        for (TaskAllocationChangeRequest change : request.changes()) {
            AllocationCellKey key = new AllocationCellKey(
                change.participantId(),
                change.sprintId()
            );
            if (requestedValues.putIfAbsent(key, normalizeHalfDays(change.days())) != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate allocation cell");
            }
        }

        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        Set<UUID> participantIds = requestedValues.keySet().stream()
            .map(AllocationCellKey::participantId)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<UUID> sprintIds = requestedValues.keySet().stream()
            .map(AllocationCellKey::sprintId)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        Set<UUID> assignedParticipantIds = new HashSet<>(
            taskParticipantRepository.findAssignedParticipantIds(taskId, teamKey, participantIds)
        );
        if (!assignedParticipantIds.containsAll(participantIds)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Participant is not assigned to task");
        }

        Map<UUID, SprintEntity> sprints = sprintRepository.findByTeamKeyAndIdIn(teamKey, sprintIds).stream()
            .collect(Collectors.toMap(SprintEntity::getId, Function.identity()));
        if (sprints.size() != sprintIds.size()) {
            throw new EntityNotFoundException("Sprint not found");
        }
        Map<UUID, ParticipantEntity> participants = participantRepository.findByTeamKeyAndIdIn(teamKey, participantIds).stream()
            .collect(Collectors.toMap(ParticipantEntity::getId, Function.identity()));
        if (participants.size() != participantIds.size()) {
            throw new EntityNotFoundException("Participant not found");
        }

        Map<AllocationCellKey, TaskAllocationEntity> existingAllocations = taskAllocationRepository
            .findEntitiesForCells(taskId, teamKey, participantIds, sprintIds)
            .stream()
            .filter(value -> requestedValues.containsKey(new AllocationCellKey(
                value.getId().getParticipantId(),
                value.getId().getSprintId()
            )))
            .collect(Collectors.toMap(
                value -> new AllocationCellKey(value.getId().getParticipantId(), value.getId().getSprintId()),
                Function.identity()
            ));

        List<TaskHistoryChangeDto> changes = new ArrayList<>();
        requestedValues.forEach((key, days) -> {
            TaskAllocationEntity existing = existingAllocations.get(key);
            BigDecimal before = existing == null ? BigDecimal.ZERO : maxOrZero(existing.getDays());
            if (before.compareTo(days) != 0) {
                addAllocationHistoryChange(
                    changes,
                    participants.get(key.participantId()),
                    sprints.get(key.sprintId()),
                    before,
                    days
                );
            }
        });

        if (!changes.isEmpty()) {
            List<TaskAllocationEntity> toPersist = new ArrayList<>();
            List<TaskAllocationEntity> toDelete = new ArrayList<>();
            requestedValues.forEach((key, days) -> {
                TaskAllocationEntity allocation = existingAllocations.get(key);
                BigDecimal before = allocation == null ? BigDecimal.ZERO : maxOrZero(allocation.getDays());
                if (before.compareTo(days) == 0) {
                    return;
                }
                if (days.signum() == 0) {
                    if (allocation != null) {
                        toDelete.add(allocation);
                    }
                    return;
                }
                if (allocation == null) {
                    allocation = newTaskAllocation(
                        task,
                        participants.get(key.participantId()),
                        sprints.get(key.sprintId()),
                        days,
                        teamKey
                    );
                    toPersist.add(allocation);
                } else {
                    allocation.setDays(days);
                }
            });
            if (!toDelete.isEmpty()) {
                taskAllocationRepository.deleteAll(toDelete);
            }
            toPersist.forEach(entityManager::persist);
            taskAllocationRepository.flush();
            rebuildLoadsWithJpa(task, teamKey, sprintIds, sprints);
            task.setUpdatedAt(LocalDate.now());
            apiHistoryService.logTaskChange(
                teamKey,
                taskId,
                "task.allocations.update",
                "Изменена нагрузка задачи",
                changes,
                Map.of(
                    "source", "PUT /tasks/{taskId}/allocations",
                    "changedFields", changes.size()
                )
            );
        }

        Map<String, BigDecimal> loads = new LinkedHashMap<>();
        sprintIds.forEach(sprintId -> loads.put(sprintId.toString(), BigDecimal.ZERO));
        taskLoadRepository.findValuesForSprints(taskId, teamKey, new ArrayList<>(sprintIds))
            .forEach(value -> loads.put(value.getSprintId().toString(), value.getDays()));
        List<TaskAllocationCellDto> cells = requestedValues.entrySet().stream()
            .map(entry -> new TaskAllocationCellDto(
                entry.getKey().participantId().toString(),
                entry.getKey().sprintId().toString(),
                entry.getValue()
            ))
            .toList();
        return new TaskAllocationsUpdateDto(taskId.toString(), cells, loads, task.getUpdatedAt());
    }

    @Transactional
    public List<TaskDto> findAll(String teamKey, TaskFilter filter) {
        return findFilteredTasks(teamKey, filter);
    }

    @Transactional
    public Page<ParticipantWorkloadRowDto> findParticipantWorkloadPage(
        String teamKey,
        TaskFilter filter,
        Integer page,
        Integer size
    ) {
        TaskFilter effectiveFilter = filter == null ? TaskFilter.empty() : filter;
        if (effectiveFilter.quarterIds().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "quarterId is required");
        }

        int safePage = page == null ? 0 : Math.max(page, 0);
        int safeSize = size == null ? 10 : Math.min(Math.max(size, 1), 50);
        Page<ParticipantEntity> participantPage = participantRepository.findWorkloadPage(
            teamKey,
            effectiveFilter,
            safePage,
            safeSize
        );
        List<ParticipantEntity> pageParticipants = participantPage.getContent();
        Set<UUID> pageParticipantIds = pageParticipants.stream()
            .map(ParticipantEntity::getId)
            .collect(Collectors.toCollection(LinkedHashSet::new));

        Map<UUID, List<ParticipantWorkloadTaskDto>> tasksByParticipant = pageParticipantIds.isEmpty()
            ? Map.of()
            : findParticipantWorkloadTasks(teamKey, effectiveFilter, pageParticipantIds);

        List<ParticipantWorkloadRowDto> rows = pageParticipants.stream()
            .map(participant -> new ParticipantWorkloadRowDto(
                new ParticipantWorkloadParticipantDto(
                    participant.getId().toString(),
                    participant.getFullName(),
                    participant.getRole()
                ),
                tasksByParticipant.getOrDefault(participant.getId(), List.of())
            ))
            .toList();

        return new PageImpl<>(
            rows,
            participantPage.getPageable(),
            participantPage.getTotalElements()
        );
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

    private Map<UUID, List<ParticipantWorkloadTaskDto>> findParticipantWorkloadTasks(
        String teamKey,
        TaskFilter filter,
        Set<UUID> participantIds
    ) {
        TaskFilter taskFilter = new TaskFilter(
            filter.quarterIds(),
            filter.priorities(),
            filter.statuses(),
            filter.releaseDateId(),
            filter.streams(),
            filter.withoutStream(),
            filter.customers(),
            filter.withoutCustomer(),
            participantIds,
            Set.of(),
            Set.of(),
            filter.searchQuery(),
            filter.withoutQuarter(),
            null
        ).withScope("ROADMAP", null);
        List<ParticipantWorkloadTaskFlatRow> rows = taskRepository.findParticipantWorkloadRows(
            teamKey,
            taskFilter,
            participantIds
        );
        Map<UUID, List<ParticipantWorkloadTaskDto>> result = new LinkedHashMap<>();
        for (UUID participantId : participantIds) {
            result.put(participantId, new ArrayList<>());
        }

        Map<ParticipantTaskKey, MutableParticipantWorkloadTask> tasks = new LinkedHashMap<>();
        for (ParticipantWorkloadTaskFlatRow row : rows) {
            ParticipantTaskKey key = new ParticipantTaskKey(row.participantId(), row.taskId());
            MutableParticipantWorkloadTask task = tasks.computeIfAbsent(
                key,
                ignored -> new MutableParticipantWorkloadTask(row)
            );
            task.addStream(row.stream());
            task.addAllocation(row.sprintId(), row.days());
        }
        for (Map.Entry<ParticipantTaskKey, MutableParticipantWorkloadTask> entry : tasks.entrySet()) {
            result.computeIfAbsent(entry.getKey().participantId(), ignored -> new ArrayList<>())
                .add(entry.getValue().toDto());
        }
        return result;
    }

    private record ParticipantTaskKey(UUID participantId, UUID taskId) {
    }

    private class MutableParticipantWorkloadTask {

        private final UUID taskId;
        private final String title;
        private final short priority;
        private final String status;
        private final UUID leaderId;
        private final Set<String> streams = new LinkedHashSet<>();
        private final Map<String, BigDecimal> allocations = new LinkedHashMap<>();

        private MutableParticipantWorkloadTask(ParticipantWorkloadTaskFlatRow row) {
            this.taskId = row.taskId();
            this.title = row.title();
            this.priority = row.priority();
            this.status = normalizeStatus(row.status());
            this.leaderId = row.leaderId();
        }

        private void addStream(String stream) {
            if (stream != null && !stream.isBlank()) {
                streams.add(stream);
            }
        }

        private void addAllocation(UUID sprintId, BigDecimal days) {
            if (sprintId != null && days != null && days.signum() > 0) {
                allocations.put(sprintId.toString(), days);
            }
        }

        private ParticipantWorkloadTaskDto toDto() {
            return new ParticipantWorkloadTaskDto(
                taskId.toString(),
                title,
                priority,
                status,
                streams.stream().sorted().toList(),
                leaderId == null ? null : leaderId.toString(),
                allocations
            );
        }
    }

    /** A mutation keeps request order while sharing team dictionaries and response enrichment. */
    public record PlanningMutation(TaskCreateRequest create, TaskUpdateRequest update) {
        public PlanningMutation {
            if ((create == null) == (update == null)) throw new IllegalArgumentException("Exactly one mutation is required");
        }
    }

    private record MutationContext(
        List<SprintEntity> sprints,
        Map<UUID, ParticipantEntity> participants,
        Map<UUID, ReleaseEntity> releases,
        Map<String, QuarterEntity> quarters,
        Map<String, Integer> maxOrders
    ) {}

    @Transactional
    public List<TaskDto> applyPlanningBatch(String teamKey, List<PlanningMutation> mutations) {
        if (mutations.isEmpty()) return List.of();
        List<SprintEntity> sprints = fetchAllSprints(teamKey);
        var participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey).stream()
            .collect(Collectors.toMap(ParticipantEntity::getId, Function.identity()));
        var releases = releaseRepository.findAllByTeamKeyOrderByPromDateAsc(teamKey).stream()
            .collect(Collectors.toMap(ReleaseEntity::getId, Function.identity()));
        MutationContext context = new MutationContext(sprints, participants, releases, new HashMap<>(), new HashMap<>());
        List<TaskEntity> tasks = new ArrayList<>(mutations.size());
        for (PlanningMutation mutation : mutations) {
            tasks.add(mutation.create() != null
                ? createEntity(teamKey, mutation.create(), context)
                : updateEntity(teamKey, mutation.update(), context));
        }
        cleanupUnusedTaskReferenceValues(teamKey);
        Map<UUID, LocalDate> dates = releases.values().stream()
            .collect(Collectors.toMap(ReleaseEntity::getId, ReleaseEntity::getPromDate));
        Map<UUID, TaskJiraIssues> jira = fetchJiraIssuesByTask(teamKey, tasks);
        return tasks.stream().map(task -> toDto(teamKey, task, sprints, dates, jira.get(task.getId()))).toList();
    }

    @Transactional
    public TaskDto create(String teamKey, TaskCreateRequest request) {
        return toDto(teamKey, createEntity(teamKey, request, null));
    }

    private TaskEntity createEntity(String teamKey, TaskCreateRequest request, MutationContext context) {
        TaskEntity entity = new TaskEntity();
        String title = request.title() == null || request.title().isBlank() ? "Новая задача" : request.title();
        entity.setTitle(title);
        entity.setDescription(request.description() != null ? request.description() : "");
        entity.setDod(request.dod() != null ? request.dod() : "");
        entity.setPriority(request.priority() != null ? request.priority() : (short) 2);
        if (request.workspace() != null) entity.setWorkspace(request.workspace());
        entity.setStatus(normalizeStatus(request.status() == null && "BACKLOG".equals(entity.getWorkspace()) ? "backlog" : request.status()));
        if (request.workspace() != null && !request.workspace().equals(entity.getWorkspace())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Статус не соответствует странице задачи");
        entity.setCustomer("");
        entity.setStream("");
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setNotes(convertNotes(request.notes()));
        entity.setPlanningQuarterIds(resolvePlanningQuarterIds(request.planningQuarterIds()));
        entity.setPlanningSprintIds(resolvePlanningSprintIds(teamKey, request.planningSprintIds(), context));
        if (request.releaseDateId() != null || request.releasePromDate() != null) {
            entity.setReleaseDate(request.releasePromDate() != null ? releaseService.resolveDate(teamKey, request.releasePromDate(), request.releaseDateId()) : resolveRelease(teamKey, request.releaseDateId(), context));
        }
        if (request.initialQuarterId() != null && !request.initialQuarterId().isBlank()) {
            entity.setInitialQuarter(resolveQuarter(teamKey, request.initialQuarterId(), context));
        }
        if (request.leaderId() != null && !request.leaderId().isBlank()) {
            ParticipantEntity leader = fetchParticipant(teamKey, request.leaderId(), context);
            requireActiveParticipant(leader);
            entity.setLeaderParticipant(leader);
        }
        entity.setTeamKey(teamKey);
        entity.setDisplayOrder(resolveDisplayOrder(teamKey, entity.getWorkspace(), request.order(), context));
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

        List<SprintEntity> sprints = (context == null ? fetchAllSprints(teamKey) : context.sprints());
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        Set<UUID> loadRecalcSprintIds = new LinkedHashSet<>();
        loadRecalcSprintIds.addAll(updateParticipants(teamKey, saved, request.participantIds(), context));
        applyLoads(saved, request.loads(), sprintIndex);
        loadRecalcSprintIds.addAll(applyAllocations(saved, request.allocations(), sprintIndex, context));
        recalcLoads(saved, loadRecalcSprintIds, sprintIndex);
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
        return saved;
    }

    @Transactional
    public TaskDto update(String teamKey, TaskUpdateRequest request) {
        return toDto(teamKey, updateEntity(teamKey, request, null));
    }

    private TaskEntity updateEntity(String teamKey, TaskUpdateRequest request, MutationContext context) {
        UUID taskId = UUID.fromString(request.id());
        taskRepository.findByIdAndTeamKeyForUpdate(taskId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        TaskEntity entity = taskRepository.findWithDetailsById(taskId, teamKey);
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
            String previousWorkspace = entity.getWorkspace();
            entity.setStatus(normalizeStatus(request.status()));
            if (!previousWorkspace.equals(entity.getWorkspace())) {
                entity.setDisplayOrder(resolveDisplayOrder(teamKey, entity.getWorkspace(), null, context));
            }
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
            entity.setPlanningSprintIds(resolvePlanningSprintIds(teamKey, request.planningSprintIds(), context));
        }
        if (request.releaseDateId() != null || request.releasePromDate() != null) {
            entity.setReleaseDate(request.releasePromDate() != null ? releaseService.resolveDate(teamKey, request.releasePromDate(), request.releaseDateId()) : resolveRelease(teamKey, request.releaseDateId(), context));
        }
        if (request.initialQuarterId() != null) {
            if (request.initialQuarterId().isBlank()) {
                entity.setInitialQuarter(null);
            } else {
                entity.setInitialQuarter(resolveQuarter(teamKey, request.initialQuarterId(), context));
            }
        }
        if (request.notes() != null) {
            entity.setNotes(convertNotes(request.notes()));
        }
        if (request.leaderId() != null) {
            if (request.leaderId().isBlank()) {
                entity.setLeaderParticipant(null);
            } else {
                ParticipantEntity leader = fetchParticipant(teamKey, request.leaderId(), context);
                if (entity.getLeaderParticipant() == null
                    || !entity.getLeaderParticipant().getId().equals(leader.getId())) {
                    requireActiveParticipant(leader);
                }
                entity.setLeaderParticipant(leader);
            }
        }
        List<SprintEntity> sprints = request.participantIds() != null || request.loads() != null || request.allocations() != null ? (context == null ? fetchAllSprints(teamKey) : context.sprints()) : List.of();
        Map<UUID, SprintEntity> sprintIndex = indexSprints(sprints);
        Set<UUID> loadRecalcSprintIds = new LinkedHashSet<>();
        if (request.participantIds() != null) {
            loadRecalcSprintIds.addAll(updateParticipants(teamKey, entity, request.participantIds(), context));
        }
        if (request.loads() != null) {
            applyLoads(entity, request.loads(), sprintIndex);
        }
        if (request.allocations() != null) {
            loadRecalcSprintIds.addAll(applyAllocations(entity, request.allocations(), sprintIndex, context));
        }
        recalcLoads(entity, loadRecalcSprintIds, sprintIndex);
        if (request.order() != null) {
            reorderTask(teamKey, entity, request.order());
        }
        entity.setUpdatedAt(LocalDate.now());
        taskRepository.flush();
        if (context == null && (request.customers() != null || request.streams() != null)) cleanupUnusedTaskReferenceValues(teamKey);
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
        return entity;
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
        taskRepository.decrementWorkspaceOrderAfter(teamKey, entity.getWorkspace(), order);
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
    public TaskDto updateJiraLinks(String teamKey, UUID taskId, TaskJiraLinksUpdateRequest request) {
        TaskEntity task = taskRepository.findWithDetailsById(taskId, teamKey);
        if (task == null) {
            throw new EntityNotFoundException("Task not found");
        }

        TaskJiraIssueEntity story = upsertStoryJiraLink(teamKey, task, request.storyUrl());
        if (story != null) {
            attachParticipantJiraIssuesToStory(teamKey, task.getId(), story);
        }

        for (TaskParticipantJiraLinkUpdateRequest participantLink : request.participantLinks() == null
            ? List.<TaskParticipantJiraLinkUpdateRequest>of()
            : request.participantLinks()) {
            upsertParticipantJiraLink(teamKey, task, participantLink, story);
        }

        task.setUpdatedAt(LocalDate.now());
        taskRepository.flush();
        return findById(teamKey, taskId);
    }

    private void attachParticipantJiraIssuesToStory(String teamKey, UUID taskId, TaskJiraIssueEntity story) {
        List<TaskJiraIssueEntity> participantIssues = taskJiraIssueRepository
            .findAllByTeamKeyAndTaskIdAndIssueScope(teamKey, taskId, ISSUE_SCOPE_PARTICIPANT);
        for (TaskJiraIssueEntity participantIssue : participantIssues) {
            if (!JIRA_LINK_STATUS_CREATED.equalsIgnoreCase(participantIssue.getStatus())) {
                continue;
            }
            participantIssue.setParentTaskJiraIssue(story);
            participantIssue.setUpdatedAt(OffsetDateTime.now());
        }
    }

    private TaskJiraIssueEntity upsertStoryJiraLink(String teamKey, TaskEntity task, String rawUrl) {
        TaskJiraIssueEntity existing = taskJiraIssueRepository
            .findFirstByTeamKeyAndTaskIdAndIssueScopeOrderByCreatedAtAsc(teamKey, task.getId(), ISSUE_SCOPE_STORY)
            .orElse(null);
        JiraIssueLinkValue link = parseJiraIssueLink(rawUrl);
        if (link == null) {
            if (existing != null) {
                taskJiraIssueRepository.delete(existing);
            }
            return null;
        }

        TaskJiraIssueEntity entity = existing != null ? existing : new TaskJiraIssueEntity();
        entity.setTeamKey(teamKey);
        entity.setTask(task);
        entity.setParticipant(null);
        entity.setPlanningSprint(null);
        entity.setIssueScope(ISSUE_SCOPE_STORY);
        applyManualJiraLink(entity, link);
        return taskJiraIssueRepository.saveAndFlush(entity);
    }

    private void upsertParticipantJiraLink(
        String teamKey,
        TaskEntity task,
        TaskParticipantJiraLinkUpdateRequest request,
        TaskJiraIssueEntity story
    ) {
        UUID participantId = UUID.fromString(request.participantId());
        UUID planningSprintId = UUID.fromString(request.planningSprintId());
        ParticipantEntity participant = fetchParticipant(teamKey, request.participantId());
        if (!task.getParticipants().stream().anyMatch(row ->
            row.getParticipant() != null && participantId.equals(row.getParticipant().getId()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Participant is not assigned to task");
        }
        SprintEntity planningSprint = fetchSprint(teamKey, request.planningSprintId());

        List<TaskJiraIssueEntity> existing = taskJiraIssueRepository
            .findAllByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintId(
                teamKey,
                task.getId(),
                participantId,
                planningSprintId
            );
        JiraIssueLinkValue link = parseJiraIssueLink(request.jiraIssueUrl());
        if (link == null) {
            if (!existing.isEmpty()) {
                taskJiraIssueRepository.deleteAll(existing);
            }
            return;
        }

        TaskJiraIssueEntity entity = existing.stream()
            .filter(issue -> link.projectKey().equalsIgnoreCase(issue.getJiraProjectKey()))
            .findFirst()
            .orElse(existing.isEmpty() ? new TaskJiraIssueEntity() : existing.get(0));
        List<TaskJiraIssueEntity> extras = existing.stream()
            .filter(issue -> !Objects.equals(issue.getId(), entity.getId()))
            .toList();
        if (!extras.isEmpty()) {
            taskJiraIssueRepository.deleteAll(extras);
            taskJiraIssueRepository.flush();
        }
        entity.setTeamKey(teamKey);
        entity.setTask(task);
        entity.setParticipant(participant);
        entity.setPlanningSprint(planningSprint);
        entity.setIssueScope(ISSUE_SCOPE_PARTICIPANT);
        entity.setParentTaskJiraIssue(story);
        applyManualJiraLink(entity, link);
        taskJiraIssueRepository.saveAndFlush(entity);
    }

    private void applyManualJiraLink(TaskJiraIssueEntity entity, JiraIssueLinkValue link) {
        entity.setJiraIssueId(UNKNOWN_JIRA_ISSUE_ID);
        entity.setJiraIssueKey(link.issueKey());
        entity.setJiraIssueUrl(link.issueUrl());
        entity.setJiraProjectKey(link.projectKey());
        entity.setStatus(JIRA_LINK_STATUS_CREATED);
        entity.setLastError(null);
        entity.setUpdatedAt(OffsetDateTime.now());
    }

    private JiraIssueLinkValue parseJiraIssueLink(String rawValue) {
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.isBlank()) {
            return null;
        }
        Matcher matcher = JIRA_KEY_PATTERN.matcher(value);
        if (!matcher.find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не удалось распознать ключ Jira");
        }
        String issueKey = matcher.group(1).toUpperCase();
        int separatorIndex = issueKey.indexOf('-');
        String projectKey = separatorIndex > 0 ? issueKey.substring(0, separatorIndex) : issueKey;
        String issueUrl = value.startsWith("http://") || value.startsWith("https://")
            ? value
            : JIRA_PUBLIC_BASE_URL + "/browse/" + issueKey;
        return new JiraIssueLinkValue(projectKey, issueKey, issueUrl);
    }

    private record JiraIssueLinkValue(String projectKey, String issueKey, String issueUrl) {
    }

    @Transactional
    public TaskDto upsertAllocation(String teamKey, TaskAllocationRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        ParticipantEntity participant = participantRepository.findByIdAndTeamKey(UUID.fromString(request.participantId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
        TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
        BigDecimal beforeDays = allocation != null ? maxOrZero(allocation.getDays()) : BigDecimal.ZERO;
        BigDecimal afterDays = normalizeHalfDays(request.days());

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

    private int resolveDisplayOrder(String teamKey, String workspace, Integer requestedOrder, MutationContext context) {
        int maxOrder = context == null ? taskRepository.findMaxWorkspaceOrder(teamKey, workspace)
            : context.maxOrders().computeIfAbsent(workspace, key -> taskRepository.findMaxWorkspaceOrder(teamKey, key));
        int targetOrder = requestedOrder == null || requestedOrder < 0 ? maxOrder + 1 : Math.min(requestedOrder, maxOrder + 1);
        // Appending needs no bulk update. Its forced flush otherwise revisits every earlier task in the batch.
        if (targetOrder <= maxOrder) taskRepository.incrementWorkspaceOrderFrom(teamKey, workspace, targetOrder);
        if (context != null) context.maxOrders().put(workspace, maxOrder + 1);
        return targetOrder;
    }

    private void reorderTask(String teamKey, TaskEntity entity, Integer requestedOrder) {
        int currentOrder = entity.getDisplayOrder();
        int maxOrder = taskRepository.findMaxWorkspaceOrder(teamKey, entity.getWorkspace());
        int targetOrder = requestedOrder != null
            ? Math.max(0, Math.min(requestedOrder, maxOrder))
            : currentOrder;

        if (targetOrder == currentOrder) {
            return;
        }

        UUID taskId = entity.getId();
        if (targetOrder < currentOrder) {
            taskRepository.shiftWorkspaceOrder(taskId, teamKey, entity.getWorkspace(), targetOrder, currentOrder - 1, 1);
        } else {
            taskRepository.shiftWorkspaceOrder(taskId, teamKey, entity.getWorkspace(), currentOrder + 1, targetOrder, -1);
        }

        entity.setDisplayOrder(targetOrder);
    }

    @Transactional
    public TaskDto upsertAllocations(String teamKey, TaskAllocationBulkRequest request) {
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(UUID.fromString(request.taskId()), teamKey)
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
            BigDecimal afterDays = normalizeHalfDays(allocationEntry.getValue());
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
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(UUID.fromString(request.taskId()), teamKey)
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
                BigDecimal afterDays = normalizeHalfDays(allocationEntry.getValue());
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
        TaskEntity task = taskRepository.findByIdAndTeamKeyForUpdate(UUID.fromString(request.taskId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        if (!task.getParticipants().isEmpty() || !task.getAllocations().isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "Прямое редактирование суммарной нагрузки доступно только для задач без участников и распределения"
            );
        }
        SprintEntity sprint = fetchSprint(teamKey, request.sprintId());
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        BigDecimal nextDays = normalizeHalfDays(request.days());
        TaskLoadEntity load = task.getLoads().stream().filter(existing -> isSameLoad(existing, sprint.getId()))
            .findFirst().orElseGet(() -> taskLoadRepository.findById(id).orElse(null));
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
        if (!participant.isActive() && task.getParticipants().stream()
            .noneMatch(link -> link.getParticipant().getId().equals(participant.getId()))) {
            requireActiveParticipant(participant);
        }
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

    private TaskAllocationEntity newTaskAllocation(
        TaskEntity task,
        ParticipantEntity participant,
        SprintEntity sprint,
        BigDecimal days,
        String teamKey
    ) {
        TaskAllocationEntity created = new TaskAllocationEntity();
        created.setId(new TaskAllocationId(task.getId(), participant.getId(), sprint.getId()));
        created.setTask(task);
        created.setParticipant(participant);
        created.setSprint(sprint);
        created.setDays(days);
        created.setTeamKey(teamKey);
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

    private TaskLoadEntity newTaskLoad(
        TaskEntity task,
        SprintEntity sprint,
        BigDecimal days,
        String teamKey
    ) {
        TaskLoadEntity created = new TaskLoadEntity();
        created.setId(new TaskLoadId(task.getId(), sprint.getId()));
        created.setTask(task);
        created.setSprint(sprint);
        created.setDays(days);
        created.setTeamKey(teamKey);
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

    private Set<UUID> updateParticipants(String teamKey, TaskEntity entity, List<String> participantIds, MutationContext context) {
        List<UUID> orderedIds = participantIds != null
            ? participantIds.stream().filter(id -> id != null && !id.isBlank()).map(UUID::fromString).toList()
            : List.of();
        Set<UUID> newIds = new LinkedHashSet<>(orderedIds);

        Set<UUID> existingIds = entity.getParticipants().stream()
            .map(tp -> tp.getParticipant().getId())
            .collect(Collectors.toSet());
        Set<UUID> removedIds = new HashSet<>(existingIds);
        removedIds.removeAll(newIds);
        Set<UUID> affectedSprintIds = entity.getAllocations().stream()
            .filter(allocation -> removedIds.contains(allocation.getParticipant().getId()))
            .map(allocation -> allocation.getSprint().getId())
            .collect(Collectors.toCollection(LinkedHashSet::new));

        entity.getParticipants().removeIf(tp -> !newIds.contains(tp.getParticipant().getId()));

        Map<UUID, TaskParticipantEntity> existing = entity.getParticipants().stream()
            .collect(Collectors.toMap(tp -> tp.getParticipant().getId(), tp -> tp));

        int order = 0;
        for (UUID id : newIds) {
            TaskParticipantEntity link = existing.get(id);
            if (link == null) {
                ParticipantEntity participant = fetchParticipant(teamKey, id.toString(), context);
                requireActiveParticipant(participant);
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
        }
        return affectedSprintIds;
    }

    private void applyLoads(TaskEntity entity, Map<String, BigDecimal> loads, Map<UUID, SprintEntity> sprints) {
        if (loads == null) {
            return;
        }
        for (Map.Entry<String, BigDecimal> entry : loads.entrySet()) {
            SprintEntity sprint = resolveSprint(entity.getTeamKey(), sprints, entry.getKey());
            TaskLoadId id = new TaskLoadId(entity.getId(), sprint.getId());
            BigDecimal nextDays = normalizeHalfDays(entry.getValue());
            TaskLoadEntity load = entity.getLoads().stream().filter(existing -> isSameLoad(existing, sprint.getId()))
            .findFirst().orElseGet(() -> taskLoadRepository.findById(id).orElse(null));
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

    private Set<UUID> applyAllocations(TaskEntity entity, Map<String, Map<String, BigDecimal>> allocations,
        Map<UUID, SprintEntity> sprints, MutationContext context) {
        Set<UUID> affectedSprintIds = new LinkedHashSet<>();
        if (allocations == null) {
            return affectedSprintIds;
        }
        for (Map.Entry<String, Map<String, BigDecimal>> participantEntry : allocations.entrySet()) {
            if (participantEntry.getValue() == null) {
                continue;
            }
            ParticipantEntity participant = fetchParticipant(entity.getTeamKey(), participantEntry.getKey(), context);
            for (Map.Entry<String, BigDecimal> sprintEntry : participantEntry.getValue().entrySet()) {
                SprintEntity sprint = resolveSprint(entity.getTeamKey(), sprints, sprintEntry.getKey());
                affectedSprintIds.add(sprint.getId());
                TaskAllocationId id = new TaskAllocationId(entity.getId(), participant.getId(), sprint.getId());
                BigDecimal nextDays = normalizeHalfDays(sprintEntry.getValue());
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id).orElse(null);
                if (nextDays.compareTo(BigDecimal.ZERO) == 0) {
                    if (allocation != null) {
                        entity.getAllocations().removeIf(existing ->
                            isSameAllocation(existing, participant.getId(), sprint.getId()));
                        taskAllocationRepository.delete(allocation);
                    }
                    continue;
                }
                if (allocation == null) {
                    allocation = createTaskAllocation(entity, participant, sprint, entity.getTeamKey());
                }
                allocation.setDays(nextDays);
            }
        }
        return affectedSprintIds;
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return DEFAULT_STATUS;
        }
        String normalized = status.trim().toLowerCase();
        if (!ALLOWED_STATUSES.contains(normalized)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown task status");
        return normalized;
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

    private Map<String, BigDecimal> rebuildLoadsWithJpa(
        TaskEntity task,
        String teamKey,
        Collection<UUID> sprintIds,
        Map<UUID, SprintEntity> sprints
    ) {
        if (sprintIds.isEmpty()) {
            return Map.of();
        }

        Map<UUID, BigDecimal> totals = taskAllocationRepository.sumDaysByTaskAndSprints(
            task.getId(),
            teamKey,
            sprintIds
        ).stream().collect(Collectors.toMap(
            TaskLoadValueProjection::getSprintId,
            value -> maxOrZero(value.getDays())
        ));
        Map<UUID, TaskLoadEntity> existingLoads = taskLoadRepository.findEntitiesForSprints(
            task.getId(),
            teamKey,
            sprintIds
        ).stream().collect(Collectors.toMap(
            load -> load.getSprint().getId(),
            Function.identity()
        ));

        List<TaskLoadEntity> toPersist = new ArrayList<>();
        List<TaskLoadEntity> toDelete = new ArrayList<>();
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        for (UUID sprintId : sprintIds) {
            BigDecimal total = totals.getOrDefault(sprintId, BigDecimal.ZERO);
            TaskLoadEntity load = existingLoads.get(sprintId);
            if (total.signum() <= 0) {
                if (load != null) {
                    toDelete.add(load);
                }
                continue;
            }
            if (load == null) {
                SprintEntity sprint = sprints.get(sprintId);
                if (sprint == null) {
                    throw new EntityNotFoundException("Sprint not found");
                }
                load = newTaskLoad(task, sprint, total, teamKey);
                toPersist.add(load);
            } else {
                load.setDays(total);
            }
            result.put(sprintId.toString(), total);
        }

        if (!toDelete.isEmpty()) {
            taskLoadRepository.deleteAll(toDelete);
        }
        toPersist.forEach(entityManager::persist);
        taskLoadRepository.flush();
        return result;
    }

    private void recalcLoad(TaskEntity task, SprintEntity sprint) {
        BigDecimal total = task.getAllocations().stream()
            .filter(a -> a.getSprint().getId().equals(sprint.getId()))
            .map(TaskAllocationEntity::getDays)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = task.getLoads().stream().filter(existing -> isSameLoad(existing, sprint.getId()))
            .findFirst().orElseGet(() -> taskLoadRepository.findById(id).orElse(null));
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

    private void recalcLoads(TaskEntity task, Set<UUID> sprintIds, Map<UUID, SprintEntity> sprints) {
        for (UUID sprintId : sprintIds) {
            SprintEntity sprint = sprints.get(sprintId);
            if (sprint != null) {
                recalcLoad(task, sprint);
            }
        }
    }

    private BigDecimal maxOrZero(BigDecimal value) {
        return value != null ? value.max(BigDecimal.ZERO) : BigDecimal.ZERO;
    }

    private static final BigDecimal HALF_DAY_UNITS = BigDecimal.valueOf(2);

    private BigDecimal normalizeHalfDays(BigDecimal value) {
        BigDecimal nonNegative = maxOrZero(value);
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

    private void requireActiveParticipant(ParticipantEntity participant) {
        if (!participant.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Нельзя назначить неактивного участника на новую задачу");
        }
    }

    private ParticipantEntity fetchParticipant(String teamKey, String participantId, MutationContext context) {
        if (context == null) return fetchParticipant(teamKey, participantId);
        ParticipantEntity participant = context.participants().get(UUID.fromString(participantId));
        if (participant == null) throw new EntityNotFoundException("Participant not found");
        return participant;
    }

    private QuarterEntity resolveQuarter(String teamKey, String quarterId, MutationContext context) {
        if (context == null) return resolveQuarter(teamKey, quarterId);
        return context.quarters().computeIfAbsent(quarterId, id -> resolveQuarter(teamKey, id));
    }

    private ReleaseEntity resolveRelease(String teamKey, String releaseId, MutationContext context) {
        if (context == null) return resolveRelease(teamKey, releaseId);
        if (releaseId == null || releaseId.isBlank()) return null;
        ReleaseEntity release = context.releases().get(UUID.fromString(releaseId));
        if (release == null) throw new EntityNotFoundException("Release not found");
        return release;
    }

    private List<UUID> resolvePlanningSprintIds(String teamKey, List<String> ids, MutationContext context) {
        if (context == null) return resolvePlanningSprintIds(teamKey, ids);
        List<UUID> normalized = ids == null ? List.of() : ids.stream().filter(Objects::nonNull)
            .map(String::trim).filter(id -> !id.isBlank()).map(UUID::fromString).distinct().toList();
        if (!indexSprints(context.sprints()).keySet().containsAll(normalized)) {
            throw new EntityNotFoundException("One or more planning sprints not found");
        }
        return normalized;
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

    private record AllocationCellKey(UUID participantId, UUID sprintId) {
    }

}
