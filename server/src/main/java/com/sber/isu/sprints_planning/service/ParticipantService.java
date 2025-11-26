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
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ParticipantService {

    private final ParticipantRepository participantRepository;

    public ParticipantService(ParticipantRepository participantRepository) {
        this.participantRepository = participantRepository;
    }

    public List<ParticipantDto> findAll() {
        return participantRepository.findAllByOrderByDisplayOrderAsc().stream()
            .map(DtoMapper::toParticipantDto)
            .toList();
    }

    @Transactional
    public ParticipantDto create(ParticipantCreateRequest request) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setFullName(request.fullName());
        entity.setRole(request.role());
        entity.setRate(BigDecimal.valueOf(request.rate()));
        int nextOrder = participantRepository.findAll().stream()
            .map(ParticipantEntity::getDisplayOrder)
            .max(Comparator.naturalOrder())
            .orElse(0) + 1;
        entity.setDisplayOrder(nextOrder);
        ParticipantEntity saved = participantRepository.save(entity);
        return DtoMapper.toParticipantDto(saved);
    }

    @Transactional
    public ParticipantDto update(ParticipantUpdateRequest request) {
        ParticipantEntity entity = participantRepository.findById(UUID.fromString(request.id()))
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
        return DtoMapper.toParticipantDto(entity);
    }

    @Transactional
    public ParticipantDto delete(IdRequest request) {
        ParticipantEntity entity = participantRepository.findById(UUID.fromString(request.id()))
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        participantRepository.delete(entity);
        return DtoMapper.toParticipantDto(entity);
    }

    @Transactional
    public void reorder(ParticipantReorderRequest request) {
        var orderMap = request.orders().stream()
            .collect(java.util.stream.Collectors.toMap(ParticipantReorderRequest.ParticipantOrderDto::id,
                ParticipantReorderRequest.ParticipantOrderDto::order));
        List<ParticipantEntity> entities = participantRepository.findAll();
        for (ParticipantEntity entity : entities) {
            Integer order = orderMap.get(entity.getId().toString());
            if (order != null) {
                entity.setDisplayOrder(order);
            }
        }
    }
}
