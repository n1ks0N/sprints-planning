package com.sber.isu.sprints_planning.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record TaskHistoryItemDto(
    UUID id,
    String taskId,
    String eventType,
    String action,
    String userName,
    String sessionId,
    int statusCode,
    OffsetDateTime createdAt,
    List<TaskHistoryChangeDto> changes,
    Map<String, Object> meta
) {
}
