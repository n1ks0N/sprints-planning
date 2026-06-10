package com.sber.isu.sprints_planning.service.planning;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record PlanningSolverResult(
    PlannerType plannerType,
    Map<String, Map<String, Map<String, BigDecimal>>> taskAllocations,
    List<String> warnings,
    BigDecimal plannedDays,
    BigDecimal unplannedDays
) {
}
