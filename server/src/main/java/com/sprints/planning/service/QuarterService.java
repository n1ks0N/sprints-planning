package com.sprints.planning.service;

import com.sprints.planning.dto.QuarterDto;
import com.sprints.planning.dto.request.IdRequest;
import com.sprints.planning.dto.request.QuarterCreateRequest;
import com.sprints.planning.dto.request.QuarterUpdateRequest;
import com.sprints.planning.mapper.DtoMapper;
import com.sprints.planning.model.QuarterEntity;
import com.sprints.planning.repository.QuarterRepository;
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

    public QuarterService(QuarterRepository quarterRepository) {
        this.quarterRepository = quarterRepository;
    }

    public List<QuarterDto> findAll() {
        return quarterRepository.findAll().stream()
            .map(DtoMapper::toQuarterDto)
            .toList();
    }

    @Transactional
    public QuarterDto create(QuarterCreateRequest request) {
        LocalDate start = request.startDate();
        LocalDate end = request.endDate();
        validateDates(start, end);
        if (quarterRepository.findByNameIgnoreCase(request.name()).isPresent()) {
            throw new DataIntegrityViolationException("Quarter name must be unique");
        }
        QuarterEntity entity = new QuarterEntity();
        entity.setYear(request.year());
        entity.setNumber(request.number());
        entity.setName(request.name());
        entity.setStartDate(start);
        entity.setEndDate(end);
        QuarterEntity saved = quarterRepository.save(entity);
        return DtoMapper.toQuarterDto(saved);
    }

    @Transactional
    public QuarterDto update(QuarterUpdateRequest request) {
        QuarterEntity entity = quarterRepository.findById(UUID.fromString(request.id()))
            .orElseThrow(() -> new EntityNotFoundException("Quarter not found"));
        if (request.name() != null && !request.name().equalsIgnoreCase(entity.getName())) {
            quarterRepository.findByNameIgnoreCase(request.name())
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
    public QuarterDto delete(IdRequest request) {
        QuarterEntity entity = quarterRepository.findById(UUID.fromString(request.id()))
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
