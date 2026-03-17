package com.sber.isu.sprints_planning.dto;

public record JiraExportBatchItemDto(
    String itemId,
    String taskJiraIssueId,
    String taskId,
    String taskTitle,
    String participantId,
    String participantName,
    String planningSprintId,
    String planningSprintName,
    String status,
    String message,
    String jiraIssueId,
    String jiraIssueKey,
    String jiraIssueUrl,
    JiraIssueRequestPreviewDto jiraRequest
) {
}
