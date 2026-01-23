package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.QuarterDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterCreateRequest;
import com.sber.isu.sprints_planning.dto.request.QuarterUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.repository.QuarterRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class QuarterService {

    private final QuarterRepository quarterRepository;
    private final SprintRepository sprintRepository;
    private final TaskRepository taskRepository;

    public QuarterService(QuarterRepository quarterRepository, SprintRepository sprintRepository,
        TaskRepository taskRepository) {
        this.quarterRepository = quarterRepository;
        this.sprintRepository = sprintRepository;
        this.taskRepository = taskRepository;
    }

    public List<QuarterDto> findAll(String teamKey) {
        return quarterRepository.findByTeamKeyOrderByStartDateAsc(teamKey).stream()
            .map(DtoMapper::toQuarterDto)
            .toList();
    }

    @Transactional
    public QuarterDto create(String teamKey, QuarterCreateRequest request) {
        LocalDate start = request.startDate();
        LocalDate end = request.endDate();
        validateDates(start, end);
        if (quarterRepository.findByNameIgnoreCaseAndTeamKey(request.name(), teamKey).isPresent()) {
            throw new DataIntegrityViolationException("Quarter name must be unique");
        }
        QuarterEntity entity = new QuarterEntity();
        entity.setTeamKey(teamKey);
        entity.setYear(request.year());
        entity.setNumber(request.number());
        entity.setName(request.name());
        entity.setStartDate(start);
        entity.setEndDate(end);
        QuarterEntity saved = quarterRepository.save(entity);
        return DtoMapper.toQuarterDto(saved);
    }

    @Transactional
    public QuarterDto update(String teamKey, QuarterUpdateRequest request) {
        QuarterEntity entity = quarterRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
        if (request.name() != null && !request.name().equalsIgnoreCase(entity.getName())) {
            quarterRepository.findByNameIgnoreCaseAndTeamKey(request.name(), teamKey)
                .ifPresent(existing -> {
                    if (!existing.getId().equals(entity.getId())) {
                        throw new DataIntegrityViolationException("Quarter name must be unique");
                    }
                });
            entity.setName(request.name());
        }
        if (request.year() != null) {
            entity.setYear(request.year());
        }
        if (request.number() != null) {
            entity.setNumber(request.number());
        }
        LocalDate start = request.startDate() != null ? request.startDate() : entity.getStartDate();
        LocalDate end = request.endDate() != null ? request.endDate() : entity.getEndDate();
        validateDates(start, end);
        entity.setStartDate(start);
        entity.setEndDate(end);
        return DtoMapper.toQuarterDto(entity);
    }

    @Transactional
    public QuarterDto delete(String teamKey, IdRequest request) {
        QuarterEntity entity = quarterRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
        quarterRepository.delete(entity);
        return DtoMapper.toQuarterDto(entity);
    }

    private void validateDates(LocalDate start, LocalDate end) {
        if (start.isAfter(end)) {
            throw new IllegalArgumentException("startDate must be before endDate");
        }
    }
}
