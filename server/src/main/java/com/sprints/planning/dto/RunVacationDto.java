package com.sprints.planning.dto;

public record RunVacationDto(
    String participantId,
    String sprintId,
    int runDays,
    int vacationNormDays
) {
}
