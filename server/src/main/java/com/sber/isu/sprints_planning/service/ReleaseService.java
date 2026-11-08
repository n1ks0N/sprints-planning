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
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ReleaseService {

    private final ReleaseRepository releaseRepository;

    public ReleaseService(ReleaseRepository releaseRepository) {
        this.releaseRepository = releaseRepository;
    }

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;

    public record Option(String id, String name, LocalDate promDate) {}

    public List<Option> options(String teamKey, List<UUID> quarters, LocalDate fromDate) {
        boolean all = quarters == null || quarters.isEmpty();
        return releaseRepository.findOptions(teamKey, fromDate == null ? LocalDate.of(1, 1, 1) : fromDate, all, all ? List.of(new UUID(0, 0)) : quarters).stream()
            .map(r -> new Option(r.getId().toString(), r.getName(), r.getPromDate())).toList();
    }

    public List<Option> options(String teamKey, List<UUID> quarters, LocalDate fromDate, String search, List<UUID> ids) {
        if (ids != null && !ids.isEmpty()) {
            return releaseRepository.findSelectedOptions(teamKey, ids).stream()
                .map(r -> new Option(r.getId().toString(), r.getName(), r.getPromDate())).toList();
        }
        if (search == null || search.isBlank()) return options(teamKey, quarters, fromDate);
        return releaseRepository.searchOptions(teamKey, search.trim(), org.springframework.data.domain.PageRequest.of(0, 100))
            .stream().map(r -> new Option(r.getId().toString(), r.getName(), r.getPromDate())).toList();
    }

    @Transactional
    public ReleaseEntity resolveDate(String teamKey, String rawDate, String existingId) {
        if (rawDate == null || rawDate.isBlank()) return null;
        LocalDate date;
        try { date = LocalDate.parse(rawDate); }
        catch (java.time.DateTimeException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Некорректная дата релиза"); }
        if (existingId != null && !existingId.isBlank()) {
            ReleaseEntity selected = releaseRepository.findByIdAndTeamKey(UUID.fromString(existingId), teamKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Release not found"));
            if (!date.equals(selected.getPromDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Дата не соответствует выбранному релизу");
            return selected;
        }
        var existing = releaseRepository.findByTeamKeyAndPromDate(teamKey, date);
        if (existing.isPresent()) return existing.get();
        ReleaseEntity r = new ReleaseEntity();
        recalculateFromAnchor(r, "promDate", date);
        entityManager.createNativeQuery("""
            insert into {h-schema}releases(id, team_key, prom_date, psi_date, ops_start, ops_end, regress_start, regress_end,
              ff_date, ff_inner_date, ift_start, ift_end, build_date, cr_date, dev_start, dev_end, st_date, created_at, updated_at)
            values (:id,:team,:prom,:psi,:opsStart,:opsEnd,:regressStart,:regressEnd,:ff,:ffInner,:iftStart,:iftEnd,:build,:cr,:devStart,:devEnd,:st,:today,:today)
            on conflict (team_key, prom_date) do nothing
            """)
            .setParameter("id", UUID.randomUUID()).setParameter("team", teamKey).setParameter("prom", date)
            .setParameter("psi", r.getPsiDate()).setParameter("opsStart", r.getOpsStart()).setParameter("opsEnd", r.getOpsEnd())
            .setParameter("regressStart", r.getRegressStart()).setParameter("regressEnd", r.getRegressEnd())
            .setParameter("ff", r.getFfDate()).setParameter("ffInner", r.getFfInnerDate())
            .setParameter("iftStart", r.getIftStart()).setParameter("iftEnd", r.getIftEnd())
            .setParameter("build", r.getBuildDate()).setParameter("cr", r.getCrDate())
            .setParameter("devStart", r.getDevStart()).setParameter("devEnd", r.getDevEnd()).setParameter("st", r.getStDate())
            .setParameter("today", LocalDate.now()).executeUpdate();
        return releaseRepository.findByTeamKeyAndPromDate(teamKey, date).orElseThrow();
    }

    public List<ReleaseDto> findAll(String teamKey) {
        return releaseRepository.findAllByTeamKeyOrderByPromDateAsc(teamKey).stream()
            .map(DtoMapper::toReleaseDto)
            .toList();
    }

    @Transactional
    public ReleaseDto create(String teamKey, ReleaseCreateRequest request) {
        ensurePromDateAvailable(teamKey, request.promDate(), null);
        ReleaseEntity entity = new ReleaseEntity();
        entity.setName(request.name());
        recalculateFromAnchor(entity, "promDate", request.promDate());
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
            clearCalculatedDates(entity);
        } else if ("recalc".equalsIgnoreCase(request.action())) {
            String anchorField = request.anchorField();
            LocalDate anchorDate = request.anchorDate();
            if ((anchorField == null || anchorField.isBlank()) && request.promDate() != null) {
                anchorField = "promDate";
                anchorDate = request.promDate();
            }
            if (anchorField == null || anchorField.isBlank() || anchorDate == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Для recalc нужны anchorField и anchorDate");
            }
            if ("promDate".equals(anchorField)) {
                ensurePromDateAvailable(teamKey, anchorDate, entity.getId());
            }
            recalculateFromAnchor(entity, anchorField, anchorDate);
        }
        if (request.promDate() != null && !"recalc".equalsIgnoreCase(request.action())) {
            ensurePromDateAvailable(teamKey, request.promDate(), entity.getId());
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

    private void clearCalculatedDates(ReleaseEntity entity) {
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
    }

    private void recalculateFromAnchor(ReleaseEntity entity, String anchorField, LocalDate anchorDate) {
        switch (anchorField) {
            case "promDate" -> {
                entity.setPromDate(anchorDate);
                LocalDate psiDate = addBusinessDays(anchorDate, -1);
                entity.setPsiDate(psiDate);
                LocalDate opsStart = addBusinessDays(psiDate, -3);
                entity.setOpsStart(opsStart);
                entity.setOpsEnd(addBusinessDays(opsStart, 2));
                applyFromOpsStart(entity, opsStart);
            }
            case "psiDate" -> {
                entity.setPsiDate(anchorDate);
                LocalDate opsStart = addBusinessDays(anchorDate, -3);
                entity.setOpsStart(opsStart);
                entity.setOpsEnd(addBusinessDays(opsStart, 2));
                applyFromOpsStart(entity, opsStart);
            }
            case "opsEnd" -> {
                LocalDate opsStart = addBusinessDays(anchorDate, -2);
                entity.setOpsStart(opsStart);
                entity.setOpsEnd(anchorDate);
                applyFromOpsStart(entity, opsStart);
            }
            case "opsStart" -> {
                entity.setOpsStart(anchorDate);
                applyFromOpsStart(entity, anchorDate);
            }
            case "regressEnd" -> {
                LocalDate regressStart = addBusinessDays(anchorDate, -3);
                applyFromRegressStart(entity, regressStart);
                entity.setRegressEnd(anchorDate);
            }
            case "regressStart" -> applyFromRegressStart(entity, anchorDate);
            case "ffDate" -> applyFromFfDate(entity, anchorDate);
            case "ffInnerDate" -> {
                LocalDate ffDate = addBusinessDays(anchorDate, 3);
                applyFromFfDate(entity, ffDate);
                entity.setFfInnerDate(anchorDate);
            }
            case "iftEnd" -> {
                LocalDate iftStart = addBusinessDays(anchorDate, -4);
                applyFromIftStart(entity, iftStart);
                entity.setIftEnd(anchorDate);
            }
            case "iftStart" -> applyFromIftStart(entity, anchorDate);
            case "buildDate" -> applyFromBuildDate(entity, anchorDate);
            case "crDate" -> applyFromCrDate(entity, anchorDate);
            case "devEnd" -> {
                entity.setDevEnd(anchorDate);
                LocalDate devStart = addBusinessDays(anchorDate, -6);
                entity.setDevStart(devStart);
                entity.setStDate(addBusinessDays(devStart, -1));
            }
            case "devStart" -> {
                entity.setDevStart(anchorDate);
                entity.setStDate(addBusinessDays(anchorDate, -1));
            }
            case "stDate" -> entity.setStDate(anchorDate);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Неизвестное поле пересчета");
        }
    }

    private void applyFromOpsStart(ReleaseEntity entity, LocalDate opsStart) {
        LocalDate regressStart = addBusinessDays(opsStart, -4);
        LocalDate regressEnd = addBusinessDays(regressStart, 3);
        LocalDate ffDate = addBusinessDays(regressStart, -1);
        LocalDate ffInnerDate = addBusinessDays(ffDate, -3);
        LocalDate iftStart = addBusinessDays(ffInnerDate, -5);
        LocalDate iftEnd = addBusinessDays(iftStart, 4);
        LocalDate buildDate = addBusinessDays(iftStart, -1);
        LocalDate crDate = addBusinessDays(buildDate, -1);
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setRegressStart(regressStart);
        entity.setRegressEnd(regressEnd);
        entity.setFfDate(ffDate);
        entity.setFfInnerDate(ffInnerDate);
        entity.setIftStart(iftStart);
        entity.setIftEnd(iftEnd);
        entity.setBuildDate(buildDate);
        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private void applyFromRegressStart(ReleaseEntity entity, LocalDate regressStart) {
        LocalDate regressEnd = addBusinessDays(regressStart, 3);
        LocalDate ffDate = addBusinessDays(regressStart, -1);
        LocalDate ffInnerDate = addBusinessDays(ffDate, -3);
        LocalDate iftStart = addBusinessDays(ffInnerDate, -5);
        LocalDate iftEnd = addBusinessDays(iftStart, 4);
        LocalDate buildDate = addBusinessDays(iftStart, -1);
        LocalDate crDate = addBusinessDays(buildDate, -1);
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setRegressStart(regressStart);
        entity.setRegressEnd(regressEnd);
        entity.setFfDate(ffDate);
        entity.setFfInnerDate(ffInnerDate);
        entity.setIftStart(iftStart);
        entity.setIftEnd(iftEnd);
        entity.setBuildDate(buildDate);
        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private void applyFromFfDate(ReleaseEntity entity, LocalDate ffDate) {
        LocalDate ffInnerDate = addBusinessDays(ffDate, -3);
        LocalDate iftStart = addBusinessDays(ffInnerDate, -5);
        LocalDate iftEnd = addBusinessDays(iftStart, 4);
        LocalDate buildDate = addBusinessDays(iftStart, -1);
        LocalDate crDate = addBusinessDays(buildDate, -1);
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setFfDate(ffDate);
        entity.setFfInnerDate(ffInnerDate);
        entity.setIftStart(iftStart);
        entity.setIftEnd(iftEnd);
        entity.setBuildDate(buildDate);
        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private void applyFromIftStart(ReleaseEntity entity, LocalDate iftStart) {
        LocalDate iftEnd = addBusinessDays(iftStart, 4);
        LocalDate buildDate = addBusinessDays(iftStart, -1);
        LocalDate crDate = addBusinessDays(buildDate, -1);
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setIftStart(iftStart);
        entity.setIftEnd(iftEnd);
        entity.setBuildDate(buildDate);
        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private void applyFromBuildDate(ReleaseEntity entity, LocalDate buildDate) {
        LocalDate crDate = addBusinessDays(buildDate, -1);
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setBuildDate(buildDate);
        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private void applyFromCrDate(ReleaseEntity entity, LocalDate crDate) {
        LocalDate devStart = addBusinessDays(crDate, -7);
        LocalDate devEnd = addBusinessDays(devStart, 6);
        LocalDate stDate = addBusinessDays(devStart, -1);

        entity.setCrDate(crDate);
        entity.setDevStart(devStart);
        entity.setDevEnd(devEnd);
        entity.setStDate(stDate);
    }

    private LocalDate addBusinessDays(LocalDate date, int delta) {
        if (delta == 0) {
            return date;
        }
        LocalDate current = date;
        int step = delta > 0 ? 1 : -1;
        int remaining = Math.abs(delta);
        while (remaining > 0) {
            current = current.plusDays(step);
            DayOfWeek day = current.getDayOfWeek();
            if (day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY) {
                remaining--;
            }
        }
        return current;
    }

    private void ensurePromDateAvailable(String teamKey, LocalDate promDate, UUID currentId) {
        boolean exists = currentId == null
            ? releaseRepository.existsByTeamKeyAndPromDate(teamKey, promDate)
            : releaseRepository.existsByTeamKeyAndPromDateAndIdNot(teamKey, promDate, currentId);
        if (exists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Релиз с такой датой ПРОМ уже существует");
        }
    }
}
