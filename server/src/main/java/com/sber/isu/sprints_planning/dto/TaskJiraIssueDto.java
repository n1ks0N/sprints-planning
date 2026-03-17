package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;

public record TaskJiraIssueDto(
    String participantId,
    String planningSprintId,
    String jiraIssueId,
    String jiraIssueKey,
    String jiraIssueUrl,
    String jiraProjectKey,
    Long jiraSprintId,
    BigDecimal storyPoints,
    String createdAt
) {
}
