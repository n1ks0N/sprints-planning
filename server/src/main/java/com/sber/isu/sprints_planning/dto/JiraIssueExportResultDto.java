package com.sber.isu.sprints_planning.dto;

public record JiraIssueExportResultDto(
    String taskId,
    String taskTitle,
    String participantId,
    String participantName,
    String status,
    String message,
    String jiraIssueId,
    String jiraIssueKey,
    String jiraIssueUrl,
    JiraIssueRequestPreviewDto jiraRequest
) {
}
