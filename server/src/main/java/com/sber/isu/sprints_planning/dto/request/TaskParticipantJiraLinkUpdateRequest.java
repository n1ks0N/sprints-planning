package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotBlank;

public record TaskParticipantJiraLinkUpdateRequest(
    @NotBlank String participantId,
    @NotBlank String planningSprintId,
    String jiraIssueUrl
) {
}
