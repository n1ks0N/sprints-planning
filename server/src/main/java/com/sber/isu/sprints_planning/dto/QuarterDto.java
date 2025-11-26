package com.sber.isu.sprints_planning.dto;

public record QuarterDto(
    String id,
    int year,
    short number,
    String name,
    String startDate,
    String endDate
) {
}
