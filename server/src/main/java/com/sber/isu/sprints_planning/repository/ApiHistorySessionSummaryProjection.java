package com.sber.isu.sprints_planning.repository;

import java.time.OffsetDateTime;

public interface ApiHistorySessionSummaryProjection {

    String getSessionId();

    String getUserName();

    OffsetDateTime getLatestCreatedAt();
}
