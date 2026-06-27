package com.sber.isu.sprints_planning.repository;

import java.time.Instant;

public interface ApiHistorySessionSummaryProjection {

    String getSessionId();

    String getUserName();

    Instant getLatestCreatedAt();
}
