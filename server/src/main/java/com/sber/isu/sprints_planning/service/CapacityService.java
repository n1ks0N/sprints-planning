package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.config.CapacityProperties;
import com.sber.isu.sprints_planning.dto.CapacityCellDto;
import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class CapacityService {

    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final CapacityProperties capacityProperties;

    public CapacityService(ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        CapacityProperties capacityProperties) {
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.capacityProperties = capacityProperties;
    }

    public List<CapacityRowDto> calculate(String teamKey, UUID quarterId) {
        List<SprintEntity> sprints = sprintRepository.findByTeamKeyAndQuarterIdOrderByOrderAsc(teamKey, quarterId);
        double normFactor = capacityProperties.normFactor();
        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        List<CapacityRowDto> rows = new ArrayList<>();
        for (ParticipantEntity participant : participants) {
            double participantRate = participant.getRate() != null ? participant.getRate().doubleValue() : 0.0;
            List<CapacityCellDto> cells = new ArrayList<>();
            int total = 0;
            for (SprintEntity sprint : sprints) {
                int runDays = 0;
                int vacationDays = 0;
                int baseCapacity = (int) Math.round(sprint.getWorkingDays() * participantRate * normFactor);
                int available = Math.max(0, baseCapacity - runDays - vacationDays);
                cells.add(new CapacityCellDto(
                    participant.getId().toString(),
                    sprint.getId().toString(),
                    sprint.getWorkingDays(),
                    participantRate,
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
                    participantRate
                ),
                cells,
                total
            ));
        }
        return rows;
    }
}
