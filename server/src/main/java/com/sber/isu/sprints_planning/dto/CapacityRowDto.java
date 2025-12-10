package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record CapacityRowDto(
    ParticipantDto participant,
    List<CapacityCellDto> cells,
    double totalQuarterAvailable,
    double totalQuarterWorkload
) {
}
