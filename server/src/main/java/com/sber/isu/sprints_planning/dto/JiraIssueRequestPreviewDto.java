package com.sber.isu.sprints_planning.dto;

import java.util.Map;

public record JiraIssueRequestPreviewDto(
    String method,
    String url,
    Map<String, String> headers,
    Map<String, Object> body
) {
}
