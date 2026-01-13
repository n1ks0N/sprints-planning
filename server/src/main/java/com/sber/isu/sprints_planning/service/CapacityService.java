package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.config.CapacityProperties;
import com.sber.isu.sprints_planning.dto.CapacityCellDto;
import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.WorkloadAggregation;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class CapacityService {

    private final ParticipantRepository participantRepository;
    private final SprintRepository sprintRepository;
    private final TaskAllocationRepository taskAllocationRepository;
    private final CapacityProperties capacityProperties;

    public CapacityService(ParticipantRepository participantRepository,
        SprintRepository sprintRepository,
        TaskAllocationRepository taskAllocationRepository,
        CapacityProperties capacityProperties) {
        this.participantRepository = participantRepository;
        this.sprintRepository = sprintRepository;
        this.taskAllocationRepository = taskAllocationRepository;
        this.capacityProperties = capacityProperties;
    }

    public List<CapacityRowDto> calculate(
        String teamKey,
        List<UUID> quarterIds,
        List<UUID> participantIds,
        List<String> roles,
        List<String> userStreams
    ) {
        List<SprintEntity> sprints = resolveSprints(teamKey, quarterIds);
        if (sprints.isEmpty()) {
            return Collections.emptyList();
        }

        Map<String, Map<String, Double>> workloadByParticipantAndSprint = aggregateWorkload(teamKey, sprints);

        double normFactor = capacityProperties.normFactor();
        List<ParticipantEntity> participants = participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc(teamKey);
        List<ParticipantEntity> filteredParticipants = filterParticipants(
            participants,
            participantIds,
            roles,
            userStreams
        );
        List<CapacityRowDto> rows = new ArrayList<>();
        for (ParticipantEntity participant : filteredParticipants) {
            double participantRate = participant.getRate() != null ? participant.getRate().doubleValue() : 0.0;
            double roundedParticipantRate = roundToOneDecimal(participantRate);
            List<CapacityCellDto> cells = new ArrayList<>();
            double totalAvailable = 0.0;
            double totalWorkload = 0.0;
            for (SprintEntity sprint : sprints) {
                double baseCapacity = roundToOneDecimal(sprint.getWorkingDays() * participantRate * normFactor);
                double available = roundToOneDecimal(Math.max(0, baseCapacity));
                double workload = workloadByParticipantAndSprint
                    .getOrDefault(participant.getId().toString(), Collections.emptyMap())
                    .getOrDefault(sprint.getId().toString(), 0.0);
                double roundedWorkload = roundToOneDecimal(workload);
                cells.add(new CapacityCellDto(
                    participant.getId().toString(),
                    sprint.getId().toString(),
                    sprint.getWorkingDays(),
                    roundedParticipantRate,
                    normFactor,
                    baseCapacity,
                    available,
                    roundedWorkload
                ));
                totalAvailable += available;
                totalWorkload += roundedWorkload;
            }
            rows.add(new CapacityRowDto(
                new ParticipantDto(
                    participant.getId().toString(),
                    participant.getFullName(),
                    participant.getRole(),
                    roundedParticipantRate,
                    participant.getUserStreams() == null
                        ? java.util.List.of()
                        : participant.getUserStreams().stream().toList()
                ),
                cells,
                roundToOneDecimal(totalAvailable),
                roundToOneDecimal(totalWorkload)
            ));
        }
        return rows;
    }

    private double roundToOneDecimal(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private Map<String, Map<String, Double>> aggregateWorkload(String teamKey, List<SprintEntity> sprints) {
        Collection<UUID> sprintIds = sprints.stream().map(SprintEntity::getId).toList();
        List<WorkloadAggregation> aggregations = taskAllocationRepository.aggregateWorkloadByParticipantAndSprint(teamKey, sprintIds);
        Map<String, Map<String, Double>> workload = new HashMap<>();
        for (WorkloadAggregation aggregation : aggregations) {
            if (aggregation.getParticipantId() == null || aggregation.getSprintId() == null || aggregation.getTotalDays() == null) {
                continue;
            }
            String participantId = aggregation.getParticipantId().toString();
            String sprintId = aggregation.getSprintId().toString();
            double days = aggregation.getTotalDays().doubleValue();
            workload.computeIfAbsent(participantId, k -> new HashMap<>()).put(sprintId, days);
        }
        return workload;
    }

    private List<SprintEntity> resolveSprints(String teamKey, List<UUID> quarterIds) {
        List<UUID> filteredIds = quarterIds == null
            ? Collections.emptyList()
            : quarterIds.stream().filter(Objects::nonNull).toList();

        if (filteredIds.isEmpty()) {
            return sprintRepository.findByTeamKeyOrderByQuarterAndOrder(teamKey);
        }

        return sprintRepository.findByTeamKeyAndQuarterIdsOrderByQuarterAndOrder(teamKey, filteredIds);
    }

    private List<ParticipantEntity> filterParticipants(
        List<ParticipantEntity> participants,
        List<UUID> participantIds,
        List<String> roles,
        List<String> userStreams
    ) {
        if (participants.isEmpty()) {
            return participants;
        }
        List<ParticipantEntity> filtered = participants;
        if (participantIds != null && !participantIds.isEmpty()) {
            var idSet = participantIds.stream().filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            filtered = filtered.stream()
                .filter(p -> idSet.contains(p.getId()))
                .toList();
        }
        if (roles != null && !roles.isEmpty()) {
            var roleSet = roles.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.toSet());
            filtered = filtered.stream()
                .filter(p -> p.getRole() != null && roleSet.contains(p.getRole()))
                .toList();
        }
        if (userStreams != null && !userStreams.isEmpty()) {
            var streamSet = userStreams.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.toSet());
            filtered = filtered.stream()
                .filter(p -> {
                    if (p.getUserStreams() == null) {
                        return false;
                    }
                    return p.getUserStreams().stream().anyMatch(streamSet::contains);
                })
                .toList();
        }
        return filtered;
    }
}
