package com.sber.isu.sprints_planning.repository;

import java.time.OffsetDateTime;

public record ApiHistorySessionSummaryProjection(
    String sessionId,
    String userName,
    OffsetDateTime latestCreatedAt
) {
}
