package com.sber.isu.sprints_planning.dto;

public record TaskHistoryChangeDto(
    String field,
    String label,
    Object before,
    Object after
) {
}
