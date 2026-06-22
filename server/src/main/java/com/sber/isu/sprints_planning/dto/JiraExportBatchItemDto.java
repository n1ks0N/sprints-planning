package com.sber.isu.sprints_planning.dto;

public record JiraExportBatchItemDto(
    String itemId,
    String taskJiraIssueId,
    String taskId,
    String taskTitle,
    String issueScope,
    String participantId,
    String participantName,
    String planningSprintId,
    String planningSprintName,
    String projectKey,
    String status,
    boolean manualActionRequired,
    String message,
    String jiraIssueId,
    String jiraIssueKey,
    String jiraIssueUrl,
    JiraIssueRequestPreviewDto jiraRequest
) {
}
