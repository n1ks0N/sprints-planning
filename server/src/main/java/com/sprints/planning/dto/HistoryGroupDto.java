package com.sprints.planning.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record HistoryGroupDto(
    UUID id,
    String user,
    Instant createdAt,
    String description,
    boolean locked,
    Instant rolledBackAt,
    List<HistoryChangeDto> changes
) {
}
