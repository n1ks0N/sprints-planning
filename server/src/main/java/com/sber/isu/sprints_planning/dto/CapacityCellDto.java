package com.sber.isu.sprints_planning.dto;

public record CapacityCellDto(
    String participantId,
    String sprintId,
    int workingDays,
    double rate,
    double normFactor,
    double baseCapacity,
    int runDays,
    int vacationNormDays,
    double availableDays,
    double workloadDays
) {
}
