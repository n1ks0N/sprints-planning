package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantReorderRequest;
import com.sber.isu.sprints_planning.dto.request.ParticipantUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.ParticipantRoleValueEntity;
import com.sber.isu.sprints_planning.model.ParticipantStreamValueEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.ParticipantRoleValueRepository;
import com.sber.isu.sprints_planning.repository.ParticipantStreamValueRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ParticipantService {

    private final ParticipantRepository participantRepository;
    private final ParticipantRoleValueRepository participantRoleValueRepository;
    private final ParticipantStreamValueRepository participantStreamValueRepository;

    public ParticipantService(
        ParticipantRepository participantRepository,
        ParticipantRoleValueRepository participantRoleValueRepository,
        ParticipantStreamValueRepository participantStreamValueRepository
    ) {
        this.participantRepository = participantRepository;
        this.participantRoleValueRepository = participantRoleValueRepository;
        this.participantStreamValueRepository = participantStreamValueRepository;
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
        syncReferenceValues(teamKey, request.role(), entity.getUserStreams());
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
        syncReferenceValues(teamKey, entity.getRole(), entity.getUserStreams());
        cleanupUnusedReferenceValues(teamKey);
        return DtoMapper.toParticipantDto(entity);
    }

    @Transactional
    public ParticipantDto delete(String teamKey, IdRequest request) {
        ParticipantEntity entity = participantRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        participantRepository.delete(entity);
        participantRepository.flush();
        cleanupUnusedReferenceValues(teamKey);
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

    private void syncReferenceValues(String teamKey, String role, Set<String> userStreams) {
        String normalizedRole = normalizeOptional(role);
        if (normalizedRole != null && participantRoleValueRepository.findByNameAndTeamKey(normalizedRole, teamKey).isEmpty()) {
            ParticipantRoleValueEntity value = new ParticipantRoleValueEntity();
            value.setName(normalizedRole);
            value.setTeamKey(teamKey);
            value.setCreatedAt(LocalDateTime.now());
            participantRoleValueRepository.save(value);
        }
        for (String stream : userStreams) {
            String normalizedStream = normalizeOptional(stream);
            if (normalizedStream == null) {
                continue;
            }
            if (participantStreamValueRepository.findByNameAndTeamKey(normalizedStream, teamKey).isPresent()) {
                continue;
            }
            ParticipantStreamValueEntity value = new ParticipantStreamValueEntity();
            value.setName(normalizedStream);
            value.setTeamKey(teamKey);
            value.setCreatedAt(LocalDateTime.now());
            participantStreamValueRepository.save(value);
        }
    }

    private void cleanupUnusedReferenceValues(String teamKey) {
        List<UUID> unusedRoleIds = participantRoleValueRepository.findUnusedIdsByTeamKey(teamKey);
        if (!unusedRoleIds.isEmpty()) {
            participantRoleValueRepository.deleteAllByIdInBatch(unusedRoleIds);
        }
        List<UUID> unusedStreamIds = participantStreamValueRepository.findUnusedIdsByTeamKey(teamKey);
        if (!unusedStreamIds.isEmpty()) {
            participantStreamValueRepository.deleteAllByIdInBatch(unusedStreamIds);
        }
    }
}
