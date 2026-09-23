package com.sber.isu.sprints_planning.repository;

import java.math.BigDecimal;
import java.util.UUID;

public interface TaskAllocationValueProjection {
    UUID getParticipantId();
    UUID getSprintId();
    BigDecimal getDays();
}
