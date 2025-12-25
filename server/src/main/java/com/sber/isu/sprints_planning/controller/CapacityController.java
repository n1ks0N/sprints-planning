package com.sber.isu.sprints_planning.controller;

import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.service.CapacityService;
import com.sber.isu.sprints_planning.util.TeamKeyNormalizer;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/{teamKey}")
public class CapacityController {

    private final CapacityService capacityService;

    public CapacityController(CapacityService capacityService) {
        this.capacityService = capacityService;
    }

    @GetMapping("/capacity")
    public List<CapacityRowDto> getCapacity(
        @PathVariable String teamKey,
        @RequestParam(value = "quarterId", required = false) String quarterId,
        @RequestParam(value = "participantId", required = false) String participantId,
        @RequestParam(value = "role", required = false) String role,
        @RequestParam(value = "userStream", required = false) String userStream
    ) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        List<UUID> quarterIds = parseQuarterIds(quarterId);
        List<UUID> participantIds = parseParticipantIds(participantId);
        List<String> roles = parseStringValues(role);
        List<String> userStreams = parseStringValues(userStream);
        return capacityService.calculate(
            normalizedTeamKey,
            quarterIds,
            participantIds,
            roles,
            userStreams
        );
    }

    private List<UUID> parseQuarterIds(String rawQuarterIds) {
        return parseUuidValues(rawQuarterIds);
    }

    private List<UUID> parseParticipantIds(String rawParticipantIds) {
        return parseUuidValues(rawParticipantIds);
    }

    private List<UUID> parseUuidValues(String rawValues) {
        if (rawValues == null || rawValues.isBlank()) {
            return List.of();
        }
        return List.of(rawValues.split(","))
            .stream()
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .map(UUID::fromString)
            .collect(Collectors.toList());
    }

    private List<String> parseStringValues(String rawValues) {
        if (rawValues == null || rawValues.isBlank()) {
            return List.of();
        }
        return List.of(rawValues.split(","))
            .stream()
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toList());
    }
}
