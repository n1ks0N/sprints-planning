package com.sber.isu.sprints_planning.dto;

public record SprintDto(
    String id,
    String quarterId,
    String name,
    String startDate,
    String endDate,
    int workingDays,
    int order
) {
}
