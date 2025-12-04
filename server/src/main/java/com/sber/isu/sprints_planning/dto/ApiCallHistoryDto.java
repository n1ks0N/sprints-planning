package com.sber.isu.sprints_planning.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ApiCallHistoryDto(
    UUID id,
    String sessionId,
    String userName,
    String action,
    String path,
    String httpMethod,
    int statusCode,
    OffsetDateTime createdAt
) {
}
