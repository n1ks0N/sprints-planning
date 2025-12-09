package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.RunVacationDto;
import com.sber.isu.sprints_planning.dto.request.RunVacationBulkRequest;
import com.sber.isu.sprints_planning.dto.request.RunVacationUpsertRequest;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.RunVacationEntity;
import com.sber.isu.sprints_planning.model.RunVacationId;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.RunVacationRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class RunVacationService {

    private final RunVacationRepository runVacationRepository;
    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;

    public RunVacationService(RunVacationRepository runVacationRepository,
        ParticipantRepository participantRepository,
        SprintRepository sprintRepository) {
        this.runVacationRepository = runVacationRepository;
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
    }

    public List<RunVacationDto> findByQuarter(String teamKey, UUID quarterId) {
        return runVacationRepository.findByTeamKeyAndQuarterId(teamKey, quarterId).stream()
            .map(DtoMapper::toRunVacationDto)
            .toList();
    }

    @Transactional
    public RunVacationDto upsert(String teamKey, RunVacationUpsertRequest request) {
        ParticipantEntity participant = participantRepository
            .findByIdAndTeamKey(UUID.fromString(request.participantId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Participant not found"));
        SprintEntity sprint = sprintRepository
            .findByIdAndTeamKey(UUID.fromString(request.sprintId()), teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));
        RunVacationId id = new RunVacationId(participant.getId(), sprint.getId());
        RunVacationEntity entity = runVacationRepository.findById(id)
            .orElseGet(() -> {
                RunVacationEntity created = new RunVacationEntity();
                created.setId(id);
                created.setParticipant(participant);
                created.setSprint(sprint);
                created.setRunDays(0);
                created.setVacationNormDays(0);
                created.setTeamKey(teamKey);
                return created;
            });
        entity.setTeamKey(teamKey);
        if (request.runDays() != null) {
            entity.setRunDays(normalizeDays(request.runDays()));
        }
        if (request.vacationNormDays() != null) {
            entity.setVacationNormDays(normalizeDays(request.vacationNormDays()));
        }
        RunVacationEntity saved = runVacationRepository.save(entity);
        return DtoMapper.toRunVacationDto(saved);
    }

    @Transactional
    public void bulk(String teamKey, RunVacationBulkRequest request) {
        UUID quarterId = request.quarterId() != null ? UUID.fromString(request.quarterId()) : null;
        if (quarterId == null) {
            throw new IllegalArgumentException("quarterId is required");
        }
        List<SprintEntity> sprints = sprintRepository.findByTeamKeyAndQuarterIdOrderByOrderAsc(teamKey, quarterId);
        Set<String> roles = request.roles() != null && !request.roles().isEmpty()
            ? Set.copyOf(request.roles())
            : null;
        double baseDays = request.daysPerSprint() != null ? request.daysPerSprint() : 0;
        boolean multiplyByRate = request.multiplyByRate() == null || request.multiplyByRate();
        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        for (ParticipantEntity participant : participants) {
            if (roles != null && !roles.contains(participant.getRole())) {
                continue;
            }
            double participantRate = participant.getRate() != null ? participant.getRate().doubleValue() : 0.0;
            for (SprintEntity sprint : sprints) {
                RunVacationId id = new RunVacationId(participant.getId(), sprint.getId());
                RunVacationEntity entity = runVacationRepository.findById(id)
                    .orElseGet(() -> {
                        RunVacationEntity created = new RunVacationEntity();
                        created.setId(id);
                        created.setParticipant(participant);
                        created.setSprint(sprint);
                        created.setRunDays(0);
                        created.setVacationNormDays(0);
                        created.setTeamKey(teamKey);
                        return created;
                    });
                entity.setTeamKey(teamKey);
                double value = baseDays;
                if (multiplyByRate) {
                    value = baseDays * participantRate;
                }
                entity.setRunDays((int) Math.max(0, Math.round(value)));
                runVacationRepository.save(entity);
            }
        }
    }

    private int normalizeDays(Number value) {
        return (int) Math.max(0, Math.round(value.doubleValue()));
    }
}
