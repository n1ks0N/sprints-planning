package com.sber.isu.sprints_planning.dto;

public record CapacityCellDto(
    String participantId,
    String sprintId,
    int workingDays,
    double rate,
    double normFactor,
    double baseCapacity,
    double availableDays,
    double workloadDays
) {
}
