package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record TaskDto(
    String id,
    String title,
    String description,
    String dod,
    short priority,
    String status,
    List<String> customers,
    List<String> streams,
    List<String> participantIds,
    Map<String, BigDecimal> loads,
    Map<String, Map<String, BigDecimal>> allocations,
    Map<String, String> notes,
    Map<String, Map<String, TaskJiraIssueDto>> jiraIssues,
    String releaseDateId,
    String initialQuarterId,
    String releaseSprintId,
    String leaderId,
    Integer order,
    String createdAt,
    String updatedAt
) {
}
