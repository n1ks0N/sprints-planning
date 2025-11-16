package com.sprints.planning.dto;

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
