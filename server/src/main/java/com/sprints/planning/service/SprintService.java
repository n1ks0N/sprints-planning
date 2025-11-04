package com.sprints.planning.service;

import com.sprints.planning.dto.SprintDto;
import com.sprints.planning.dto.request.IdRequest;
import com.sprints.planning.dto.request.SprintCreateRequest;
import com.sprints.planning.dto.request.SprintUpdateRequest;
import com.sprints.planning.mapper.DtoMapper;
import com.sprints.planning.model.QuarterEntity;
import com.sprints.planning.model.SprintEntity;
import com.sprints.planning.repository.QuarterRepository;
import com.sprints.planning.repository.SprintRepository;
import com.sprints.planning.util.DateUtils;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class SprintService {

    private final SprintRepository sprintRepository;
    private final QuarterRepository quarterRepository;

    public SprintService(SprintRepository sprintRepository, QuarterRepository quarterRepository) {
        this.sprintRepository = sprintRepository;
        this.quarterRepository = quarterRepository;
    }

    public List<SprintDto> findAll(UUID quarterId) {
        List<SprintEntity> sprints;
        if (quarterId != null) {
            sprints = sprintRepository.findByQuarterIdOrderByOrderAsc(quarterId);
        } else {
            sprints = sprintRepository.findAll().stream()
                .sorted(Comparator.comparing((SprintEntity s) -> s.getQuarter().getStartDate())
                    .thenComparing(SprintEntity::getOrder))
                .toList();
        }
        return sprints.stream().map(DtoMapper::toSprintDto).toList();
    }

    @Transactional
    public SprintDto create(SprintCreateRequest request) {
        QuarterEntity quarter = quarterRepository.findById(UUID.fromString(request.quarterId()))
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
        LocalDate start = request.startDate();
        LocalDate end = request.endDate();
        validateDates(start, end);
        SprintEntity entity = new SprintEntity();
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
    public SprintDto update(SprintUpdateRequest request) {
        SprintEntity entity = sprintRepository.findById(UUID.fromString(request.id()))
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
        if (request.name() != null) {
            entity.setName(request.name());
        }
        QuarterEntity quarter = entity.getQuarter();
        if (request.quarterId() != null && !request.quarterId().equals(quarter.getId().toString())) {
            quarter = quarterRepository.findById(UUID.fromString(request.quarterId()))
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
    public SprintDto delete(IdRequest request) {
        SprintEntity entity = sprintRepository.findById(UUID.fromString(request.id()))
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
