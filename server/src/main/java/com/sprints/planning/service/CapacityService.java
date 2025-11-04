package com.sprints.planning.service;

import com.sprints.planning.config.CapacityProperties;
import com.sprints.planning.dto.CapacityCellDto;
import com.sprints.planning.dto.CapacityRowDto;
import com.sprints.planning.dto.ParticipantDto;
import com.sprints.planning.model.ParticipantEntity;
import com.sprints.planning.model.RunVacationEntity;
import com.sprints.planning.model.RunVacationId;
import com.sprints.planning.model.SprintEntity;
import com.sprints.planning.repository.ParticipantRepository;
import com.sprints.planning.repository.RunVacationRepository;
import com.sprints.planning.repository.SprintRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class CapacityService {

    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final RunVacationRepository runVacationRepository;
    private final CapacityProperties capacityProperties;

    public CapacityService(ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        RunVacationRepository runVacationRepository,
        CapacityProperties capacityProperties) {
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.runVacationRepository = runVacationRepository;
        this.capacityProperties = capacityProperties;
    }

    public List<CapacityRowDto> calculate(UUID quarterId) {
        List<SprintEntity> sprints = sprintRepository.findByQuarterIdOrderByOrderAsc(quarterId);
        Map<RunVacationId, RunVacationEntity> runVacationMap = new HashMap<>();
        for (RunVacationEntity entity : runVacationRepository.findByQuarterId(quarterId)) {
            runVacationMap.put(entity.getId(), entity);
        }
        double normFactor = capacityProperties.normFactor();
        List<ParticipantEntity> participants = participantRepository.findAllByOrderByDisplayOrderAsc();
        List<CapacityRowDto> rows = new ArrayList<>();
        for (ParticipantEntity participant : participants) {
            List<CapacityCellDto> cells = new ArrayList<>();
            int total = 0;
            for (SprintEntity sprint : sprints) {
                RunVacationId id = new RunVacationId(participant.getId(), sprint.getId());
                RunVacationEntity rv = runVacationMap.get(id);
                int runDays = rv != null ? rv.getRunDays() : 0;
                int vacationDays = rv != null ? rv.getVacationNormDays() : 0;
                int baseCapacity = (int) Math.round(sprint.getWorkingDays() * participant.getRate() * normFactor);
                int available = Math.max(0, baseCapacity - runDays - vacationDays);
                cells.add(new CapacityCellDto(
                    participant.getId().toString(),
                    sprint.getId().toString(),
                    sprint.getWorkingDays(),
                    participant.getRate(),
                    normFactor,
                    baseCapacity,
                    runDays,
                    vacationDays,
                    available
                ));
                total += available;
            }
            rows.add(new CapacityRowDto(
                new ParticipantDto(
                    participant.getId().toString(),
                    participant.getFullName(),
                    participant.getRole(),
                    participant.getRate()
                ),
                cells,
                total
            ));
        }
        return rows;
    }
}
