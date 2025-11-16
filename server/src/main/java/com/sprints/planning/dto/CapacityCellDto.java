package com.sprints.planning.dto;

public record CapacityCellDto(
    String participantId,
    String sprintId,
    int workingDays,
    double rate,
    double normFactor,
    int baseCapacity,
    int runDays,
    int vacationNormDays,
    int availableDays
) {
}
