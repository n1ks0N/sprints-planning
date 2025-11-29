package com.sber.isu.sprints_planning.dto;

public record RunVacationDto(
    String participantId,
    String sprintId,
    int runDays,
    int vacationNormDays
) {
}
