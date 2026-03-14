package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantReorderRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ParticipantService {

    private final ParticipantRepository participantRepository;

    public ParticipantService(ParticipantRepository participantRepository) {
        this.participantRepository = participantRepository;
    }

    public List<ParticipantDto> findAll(String teamKey) {
        return participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey).stream()
            .map(DtoMapper::toParticipantDto)
            .toList();
    }

    @Transactional
    public ParticipantDto create(String teamKey, ParticipantCreateRequest request) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setFullName(request.fullName());
        entity.setRole(request.role());
        entity.setRate(BigDecimal.valueOf(request.rate()));
        entity.setUserStreams(normalizeUserStreams(request.userStreams()));
        entity.setJiraLogin(normalizeOptional(request.jiraLogin()));
        int nextOrder = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey).stream()
            .map(ParticipantEntity::getDisplayOrder)
            .max(Comparator.naturalOrder())
            .orElse(0) + 1;
        entity.setDisplayOrder(nextOrder);
        entity.setTeamKey(teamKey);
        ParticipantEntity saved = participantRepository.save(entity);
        return DtoMapper.toParticipantDto(saved);
    }

    @Transactional
    public ParticipantDto update(String teamKey, ParticipantUpdateRequest request) {
        ParticipantEntity entity = participantRepository
            .findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        if (request.fullName() != null) {
            entity.setFullName(request.fullName());
        }
        if (request.role() != null) {
            entity.setRole(request.role());
        }
        if (request.rate() != null) {
            entity.setRate(BigDecimal.valueOf(request.rate()));
        }
        if (request.userStreams() != null) {
            entity.setUserStreams(normalizeUserStreams(request.userStreams()));
        }
        if (request.jiraLogin() != null) {
            entity.setJiraLogin(normalizeOptional(request.jiraLogin()));
        }
        return DtoMapper.toParticipantDto(entity);
    }

    @Transactional
    public ParticipantDto delete(String teamKey, IdRequest request) {
        ParticipantEntity entity = participantRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        participantRepository.delete(entity);
        return DtoMapper.toParticipantDto(entity);
    }

    @Transactional
    public void reorder(String teamKey, ParticipantReorderRequest request) {
        var orderMap = request.orders().stream()
            .collect(java.util.stream.Collectors.toMap(ParticipantReorderRequest.ParticipantOrderDto::id,
                ParticipantReorderRequest.ParticipantOrderDto::order));
        List<ParticipantEntity> entities = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        for (ParticipantEntity entity : entities) {
            Integer order = orderMap.get(entity.getId().toString());
            if (order != null) {
                entity.setDisplayOrder(order);
            }
        }
    }

    private Set<String> normalizeUserStreams(List<String> raw) {
        if (raw == null) {
            return new LinkedHashSet<>();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String value : raw) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (!trimmed.isEmpty()) {
                normalized.add(trimmed);
            }
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
