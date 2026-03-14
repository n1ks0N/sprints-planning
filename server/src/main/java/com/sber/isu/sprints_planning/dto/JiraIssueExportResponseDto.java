package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record JiraIssueExportResponseDto(
    List<JiraIssueExportResultDto> items
) {
}
