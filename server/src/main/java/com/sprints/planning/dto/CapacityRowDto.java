package com.sprints.planning.dto;

import java.util.List;

public record CapacityRowDto(
    ParticipantDto participant,
    List<CapacityCellDto> cells,
    int totalQuarterAvailable
) {
}
