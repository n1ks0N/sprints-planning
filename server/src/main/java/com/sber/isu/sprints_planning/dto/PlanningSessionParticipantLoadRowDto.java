package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record PlanningSessionParticipantLoadRowDto(
    ParticipantDto participant,
    List<PlanningSessionParticipantLoadCellDto> cells,
    double totalCapacity,
    double totalCommitted,
    double totalDraft,
    double totalLoad,
    double totalOverload,
    double totalFree
) {
}
