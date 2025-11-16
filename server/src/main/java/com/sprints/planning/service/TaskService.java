package com.sprints.planning.service;

import com.sprints.planning.dto.TaskDto;
import com.sprints.planning.dto.request.IdRequest;
import com.sprints.planning.dto.request.TaskAllocationRequest;
import com.sprints.planning.dto.request.TaskCreateRequest;
import com.sprints.planning.dto.request.TaskLoadRequest;
import com.sprints.planning.dto.request.TaskUpdateRequest;
import com.sprints.planning.mapper.DtoMapper;
import com.sprints.planning.model.ParticipantEntity;
import com.sprints.planning.model.SprintEntity;
import com.sprints.planning.model.TaskAllocationEntity;
import com.sprints.planning.model.TaskAllocationId;
import com.sprints.planning.model.TaskEntity;
import com.sprints.planning.model.TaskLoadEntity;
import com.sprints.planning.model.TaskLoadId;
import com.sprints.planning.model.TaskParticipantEntity;
import com.sprints.planning.model.TaskParticipantId;
import com.sprints.planning.repository.ParticipantRepository;
import com.sprints.planning.repository.SprintRepository;
import com.sprints.planning.repository.TaskAllocationRepository;
import com.sprints.planning.repository.TaskLoadRepository;
import com.sprints.planning.repository.TaskRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
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

    public List<TaskDto> findAll(UUID quarterId) {
        List<TaskEntity> tasks;
        if (quarterId != null) {
            tasks = taskRepository.findByQuarterWithLoad(quarterId);
        } else {
            tasks = taskRepository.findAll();
        }
        tasks.forEach(this::ensureLoadsForAllSprints);
        return tasks.stream().map(DtoMapper::toTaskDto).toList();
    }

    @Transactional
    public TaskDto create(TaskCreateRequest request) {
        TaskEntity entity = new TaskEntity();
        String title = request.title() == null || request.title().isBlank() ? "Новая задача" : request.title();
        entity.setTitle(title);
        entity.setDod(request.dod() != null ? request.dod() : "");
        entity.setPriority(request.priority() != null ? request.priority() : (short) 2);
        entity.setCustomer(request.customer() != null ? request.customer() : "");
        entity.setStream(request.stream() != null ? request.stream() : "");
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setNotes(convertNotes(request.notes()));
        if (request.releaseDate() != null) {
            entity.setReleaseDate(request.releaseDate());
        }
        if (request.releaseSprintId() != null && !request.releaseSprintId().isBlank()) {
            entity.setReleaseSprint(fetchSprint(request.releaseSprintId()));
        }
        TaskEntity saved = taskRepository.save(entity);
        updateParticipants(saved, request.participantIds());
        applyLoads(saved, request.loads());
        applyAllocations(saved, request.allocations());
        ensureLoadsForAllSprints(saved);
        return DtoMapper.toTaskDto(saved);
    }

    @Transactional
    public TaskDto update(TaskUpdateRequest request) {
        TaskEntity entity = taskRepository.findById(UUID.fromString(request.id()))
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        if (request.title() != null) {
            entity.setTitle(request.title());
        }
        if (request.dod() != null) {
            entity.setDod(request.dod());
        }
        if (request.priority() != null) {
            entity.setPriority(request.priority());
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
                entity.setReleaseSprint(fetchSprint(request.releaseSprintId()));
            }
        }
        if (request.notes() != null) {
            entity.setNotes(convertNotes(request.notes()));
        }
        if (request.participantIds() != null) {
            updateParticipants(entity, request.participantIds());
        }
        if (request.loads() != null) {
            applyLoads(entity, request.loads());
        }
        if (request.allocations() != null) {
            applyAllocations(entity, request.allocations());
        }
        entity.setUpdatedAt(LocalDate.now());
        ensureLoadsForAllSprints(entity);
        return DtoMapper.toTaskDto(entity);
    }

    @Transactional
    public TaskDto delete(IdRequest request) {
        TaskEntity entity = taskRepository.findById(UUID.fromString(request.id()))
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        taskRepository.delete(entity);
        return DtoMapper.toTaskDto(entity);
    }

    @Transactional
    public TaskDto upsertAllocation(TaskAllocationRequest request) {
        TaskEntity task = taskRepository.findById(UUID.fromString(request.taskId()))
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        ParticipantEntity participant = participantRepository.findById(UUID.fromString(request.participantId()))
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        SprintEntity sprint = fetchSprint(request.sprintId());
        TaskAllocationId id = new TaskAllocationId(task.getId(), participant.getId(), sprint.getId());
        TaskAllocationEntity allocation = taskAllocationRepository.findById(id)
            .orElseGet(() -> {
                TaskAllocationEntity created = new TaskAllocationEntity();
                created.setId(id);
                created.setTask(task);
                created.setParticipant(participant);
                created.setSprint(sprint);
                created.setDays(0);
                task.getAllocations().add(created);
                return created;
            });
        allocation.setDays(Math.max(0, request.days() != null ? request.days() : 0));
        recalcLoad(task, sprint);
        task.setUpdatedAt(LocalDate.now());
        ensureLoadsForAllSprints(task);
        return DtoMapper.toTaskDto(task);
    }

    @Transactional
    public TaskDto upsertLoad(TaskLoadRequest request) {
        TaskEntity task = taskRepository.findById(UUID.fromString(request.taskId()))
            .orElseThrow(() -> new EntityNotFoundException("Task not found"));
        SprintEntity sprint = fetchSprint(request.sprintId());
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = taskLoadRepository.findById(id)
            .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(task);
                created.setSprint(sprint);
                created.setDays(0);
                task.getLoads().add(created);
                return created;
            });
        load.setDays(Math.max(0, request.days() != null ? request.days() : 0));
        task.setUpdatedAt(LocalDate.now());
        ensureLoadsForAllSprints(task);
        return DtoMapper.toTaskDto(task);
    }

    private void updateParticipants(TaskEntity entity, List<String> participantIds) {
        Set<UUID> newIds = participantIds != null
            ? participantIds.stream().map(UUID::fromString).collect(Collectors.toSet())
            : new HashSet<>();
        entity.getParticipants().removeIf(tp -> !newIds.contains(tp.getParticipant().getId()));
        Set<UUID> existing = entity.getParticipants().stream()
            .map(tp -> tp.getParticipant().getId())
            .collect(Collectors.toSet());
        for (UUID id : newIds) {
            if (!existing.contains(id)) {
                ParticipantEntity participant = participantRepository.findById(id)
                    .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
                TaskParticipantEntity link = new TaskParticipantEntity();
                link.setId(new TaskParticipantId(entity.getId(), participant.getId()));
                link.setTask(entity);
                link.setParticipant(participant);
                entity.getParticipants().add(link);
            }
        }
    }

    private void applyLoads(TaskEntity entity, Map<String, Integer> loads) {
        if (loads == null) {
            return;
        }
        for (Map.Entry<String, Integer> entry : loads.entrySet()) {
            SprintEntity sprint = fetchSprint(entry.getKey());
            TaskLoadId id = new TaskLoadId(entity.getId(), sprint.getId());
            TaskLoadEntity load = taskLoadRepository.findById(id)
                .orElseGet(() -> {
                    TaskLoadEntity created = new TaskLoadEntity();
                    created.setId(id);
                    created.setTask(entity);
                    created.setSprint(sprint);
                    created.setDays(0);
                    entity.getLoads().add(created);
                    return created;
                });
            load.setDays(Math.max(0, entry.getValue() != null ? entry.getValue() : 0));
        }
    }

    private void applyAllocations(TaskEntity entity, Map<String, Map<String, Integer>> allocations) {
        if (allocations == null) {
            return;
        }
        for (Map.Entry<String, Map<String, Integer>> participantEntry : allocations.entrySet()) {
            if (participantEntry.getValue() == null) {
                continue;
            }
            ParticipantEntity participant = participantRepository.findById(UUID.fromString(participantEntry.getKey()))
                .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
            for (Map.Entry<String, Integer> sprintEntry : participantEntry.getValue().entrySet()) {
                SprintEntity sprint = fetchSprint(sprintEntry.getKey());
                TaskAllocationId id = new TaskAllocationId(entity.getId(), participant.getId(), sprint.getId());
                TaskAllocationEntity allocation = taskAllocationRepository.findById(id)
                    .orElseGet(() -> {
                        TaskAllocationEntity created = new TaskAllocationEntity();
                        created.setId(id);
                        created.setTask(entity);
                        created.setParticipant(participant);
                        created.setSprint(sprint);
                        created.setDays(0);
                        entity.getAllocations().add(created);
                        return created;
                    });
                allocation.setDays(Math.max(0, sprintEntry.getValue() != null ? sprintEntry.getValue() : 0));
                recalcLoad(entity, sprint);
            }
        }
    }

    private void ensureLoadsForAllSprints(TaskEntity entity) {
        List<SprintEntity> sprints = sprintRepository.findAll();
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
                        created.setDays(0);
                        entity.getLoads().add(created);
                        return created;
                    });
                load.setDays(Math.max(0, load.getDays()));
                existing.add(sprint.getId());
            }
        }
    }

    private void recalcLoad(TaskEntity task, SprintEntity sprint) {
        int total = task.getAllocations().stream()
            .filter(a -> a.getSprint().getId().equals(sprint.getId()))
            .mapToInt(TaskAllocationEntity::getDays)
            .sum();
        TaskLoadId id = new TaskLoadId(task.getId(), sprint.getId());
        TaskLoadEntity load = taskLoadRepository.findById(id)
            .orElseGet(() -> {
                TaskLoadEntity created = new TaskLoadEntity();
                created.setId(id);
                created.setTask(task);
                created.setSprint(sprint);
                created.setDays(0);
                task.getLoads().add(created);
                return created;
            });
        load.setDays(total);
    }

    private SprintEntity fetchSprint(String sprintId) {
        return sprintRepository.findById(UUID.fromString(sprintId))
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
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
