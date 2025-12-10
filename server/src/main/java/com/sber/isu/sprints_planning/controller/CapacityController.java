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
        @RequestParam(value = "quarterId", required = false) String quarterId
    ) {
        String normalizedTeamKey = TeamKeyNormalizer.normalize(teamKey);
        List<UUID> quarterIds = parseQuarterIds(quarterId);
        return capacityService.calculate(normalizedTeamKey, quarterIds);
    }

    private List<UUID> parseQuarterIds(String rawQuarterIds) {
        if (rawQuarterIds == null || rawQuarterIds.isBlank()) {
            return List.of();
        }
        return List.of(rawQuarterIds.split(","))
            .stream()
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .map(UUID::fromString)
            .collect(Collectors.toList());
    }
}
