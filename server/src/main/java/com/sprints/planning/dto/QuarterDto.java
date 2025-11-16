package com.sprints.planning.dto;

public record QuarterDto(
    String id,
    int year,
    short number,
    String name,
    String startDate,
    String endDate
) {
}
