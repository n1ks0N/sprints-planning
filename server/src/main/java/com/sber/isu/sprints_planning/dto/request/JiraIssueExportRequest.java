package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;

public record JiraIssueExportRequest(
    @NotEmpty List<String> taskIds,
    @NotBlank String planningSprintId,
    @NotBlank String jiraSprintId,
    @NotBlank String projectKey,
    Map<String, List<String>> participantIdsByTaskId,
    Map<String, Boolean> createStoryByTaskId,
    List<String> labels
) {
}
