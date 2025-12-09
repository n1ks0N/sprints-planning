package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.ReleaseDto;
import com.sber.isu.sprints_planning.dto.request.IdRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseUpdateRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ReleaseService {

    private final ReleaseRepository releaseRepository;

    public ReleaseService(ReleaseRepository releaseRepository) {
        this.releaseRepository = releaseRepository;
    }

    public List<ReleaseDto> findAll(String teamKey) {
        return releaseRepository.findAllByTeamKeyOrderByPromDateAsc(teamKey).stream()
            .map(DtoMapper::toReleaseDto)
            .toList();
    }

    @Transactional
    public ReleaseDto create(String teamKey, ReleaseCreateRequest request) {
        ReleaseEntity entity = new ReleaseEntity();
        entity.setName(request.name());
        entity.setPromDate(request.promDate());
        applyCalculatedDates(entity, request.promDate());
        entity.setCreatedAt(LocalDate.now());
        entity.setUpdatedAt(LocalDate.now());
        entity.setTeamKey(teamKey);
        ReleaseEntity saved = releaseRepository.save(entity);
        return DtoMapper.toReleaseDto(saved);
    }

    @Transactional
    public ReleaseDto update(String teamKey, ReleaseUpdateRequest request) {
        ReleaseEntity entity = releaseRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Release not found"));
        if (request.name() != null) {
            entity.setName(request.name());
        }
        if ("clear".equalsIgnoreCase(request.action())) {
            entity.setPsiDate(null);
            entity.setOpsStart(null);
            entity.setOpsEnd(null);
            entity.setRegressStart(null);
            entity.setRegressEnd(null);
            entity.setFfDate(null);
            entity.setFfInnerDate(null);
            entity.setIftStart(null);
            entity.setIftEnd(null);
            entity.setBuildDate(null);
            entity.setCrDate(null);
            entity.setDevStart(null);
            entity.setDevEnd(null);
            entity.setStDate(null);
        } else if ("recalc".equalsIgnoreCase(request.action())) {
            LocalDate prom = request.promDate() != null ? request.promDate() : entity.getPromDate();
            entity.setPromDate(prom);
            applyCalculatedDates(entity, prom);
        }
        if (request.promDate() != null && !"recalc".equalsIgnoreCase(request.action())) {
            entity.setPromDate(request.promDate());
        }
        if (request.psiDate() != null) entity.setPsiDate(request.psiDate());
        if (request.opsStart() != null) entity.setOpsStart(request.opsStart());
        if (request.opsEnd() != null) entity.setOpsEnd(request.opsEnd());
        if (request.regressStart() != null) entity.setRegressStart(request.regressStart());
        if (request.regressEnd() != null) entity.setRegressEnd(request.regressEnd());
        if (request.ffDate() != null) entity.setFfDate(request.ffDate());
        if (request.ffInnerDate() != null) entity.setFfInnerDate(request.ffInnerDate());
        if (request.iftStart() != null) entity.setIftStart(request.iftStart());
        if (request.iftEnd() != null) entity.setIftEnd(request.iftEnd());
        if (request.buildDate() != null) entity.setBuildDate(request.buildDate());
        if (request.crDate() != null) entity.setCrDate(request.crDate());
        if (request.devStart() != null) entity.setDevStart(request.devStart());
        if (request.devEnd() != null) entity.setDevEnd(request.devEnd());
        if (request.stDate() != null) entity.setStDate(request.stDate());
        entity.setUpdatedAt(LocalDate.now());
        return DtoMapper.toReleaseDto(entity);
    }

    @Transactional
    public ReleaseDto delete(String teamKey, IdRequest request) {
        ReleaseEntity entity = releaseRepository.findByIdAndTeamKey(UUID.fromString(request.id()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Release not found"));
        releaseRepository.delete(entity);
        return DtoMapper.toReleaseDto(entity);
    }

    private void applyCalculatedDates(ReleaseEntity entity, LocalDate prom) {
        entity.setPsiDate(prom.minusDays(1));
        entity.setOpsStart(entity.getPsiDate().minusDays(3));
        entity.setOpsEnd(entity.getOpsStart().plusDays(2));
        entity.setRegressStart(entity.getOpsStart().minusDays(4));
        entity.setRegressEnd(entity.getRegressStart().plusDays(3));
        entity.setFfDate(entity.getRegressStart().minusDays(1));
        entity.setFfInnerDate(entity.getFfDate().minusDays(3));
        entity.setIftStart(entity.getFfInnerDate().minusDays(5));
        entity.setIftEnd(entity.getIftStart().plusDays(4));
        entity.setBuildDate(entity.getIftStart().minusDays(1));
        entity.setCrDate(entity.getBuildDate().minusDays(1));
        entity.setDevStart(entity.getCrDate().minusDays(7));
        entity.setDevEnd(entity.getDevStart().plusDays(6));
        entity.setStDate(entity.getDevStart().minusDays(1));
    }
}
