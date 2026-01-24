package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.SprintDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.SprintCreateRequest;
import com.sber.isu.sprints_planning.dto.request.SprintUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import com.sber.isu.sprints_planning.util.DateUtils;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class SprintService {

    private final SprintRepository sprintRepository;
    private final QuarterRepository quarterRepository;
    private final TaskRepository taskRepository;

    public SprintService(
        SprintRepository sprintRepository, QuarterRepository quarterRepository, TaskRepository taskRepository) {
        this.sprintRepository = sprintRepository;
        this.quarterRepository = quarterRepository;
        this.taskRepository = taskRepository;
    }

    @Transactional(readOnly = true)
    public List<SprintDto> findAll(String teamKey, UUID quarterId) {
        List<SprintEntity> sprints;
        if (quarterId != null) {
            sprints = sprintRepository.findByTeamKeyAndQuarterIdOrderByOrderAsc(teamKey, quarterId);
        } else {
            sprints = sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey);
        }
        return sprints.stream().map(DtoMapper::toSprintDto).toList();
    }

    @Transactional
    public SprintDto create(String teamKey, SprintCreateRequest request) {
        QuarterEntity quarter = quarterRepository
            .findByIdAndTeamKey(UUID.fromString(request.quarterId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
        LocalDate start = request.startDate();
        LocalDate end = request.endDate();
        validateDates(start, end);
        SprintEntity entity = new SprintEntity();
        entity.setTeamKey(teamKey);
        entity.setQuarter(quarter);
        entity.setName(request.name());
        entity.setStartDate(start);
        entity.setEndDate(end);
        entity.setWorkingDays(request.workingDays() != null
            ? request.workingDays()
            : DateUtils.businessDaysInclusive(start, end));
        int order = request.order() != null
            ? request.order()
            : sprintRepository.findByQuarterOrderByOrderAsc(quarter).size() + 1;
        entity.setOrder(order);
        SprintEntity saved = sprintRepository.save(entity);
        return DtoMapper.toSprintDto(saved);
    }

    @Transactional
    public SprintDto update(String teamKey, SprintUpdateRequest request) {
        SprintEntity entity = sprintRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
        if (request.name() != null) {
            entity.setName(request.name());
        }
        QuarterEntity quarter = entity.getQuarter();
        if (request.quarterId() != null && !request.quarterId().equals(quarter.getId().toString())) {
            quarter = quarterRepository
                .findByIdAndTeamKey(UUID.fromString(request.quarterId()), teamKey)
                .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
            entity.setQuarter(quarter);
        }
        LocalDate start = request.startDate() != null ? request.startDate() : entity.getStartDate();
        LocalDate end = request.endDate() != null ? request.endDate() : entity.getEndDate();
        validateDates(start, end);
        entity.setStartDate(start);
        entity.setEndDate(end);
        entity.setWorkingDays(request.workingDays() != null
            ? request.workingDays()
            : DateUtils.businessDaysInclusive(start, end));
        if (request.order() != null) {
            entity.setOrder(request.order());
        }
        return DtoMapper.toSprintDto(entity);
    }

    @Transactional
    public SprintDto delete(String teamKey, IdRequest request) {
        SprintEntity entity = sprintRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
        sprintRepository.delete(entity);
        return DtoMapper.toSprintDto(entity);
    }

    private void validateDates(LocalDate start, LocalDate end) {
        if (start.isAfter(end)) {
            throw new IllegalArgumentException("startDate must be before endDate");
        }
    }
}
