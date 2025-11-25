package com.sprints.planning.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record HistoryChangeDto(
    UUID id,
    String action,
    Instant createdAt,
    Map<String, Object> undo
) {
}
