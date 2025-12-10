package com.sber.isu.sprints_planning.repository;

import java.math.BigDecimal;
import java.util.UUID;

public interface WorkloadAggregation {
    UUID getParticipantId();

    UUID getSprintId();

    BigDecimal getTotalDays();
}

