package com.sber.isu.sprints_planning.dto;

public record JiraSprintOptionDto(
    String id,
    String name,
    String state,
    String startDate,
    String endDate,
    Long boardId
) {
}
