package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;

public record PlanningSessionSolveSummaryDto(
    int taskCount,
    int participantCount,
    BigDecimal plannedDays,
    BigDecimal unplannedDays,
    int overloadedCells
) {
}
