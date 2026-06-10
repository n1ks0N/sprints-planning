package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record PlanningWorkbenchItemDto(
    String id,
    String title,
    String description,
    String dod,
    Short priority,
    List<String> customers,
    List<String> streams,
    BigDecimal estimateDays,
    List<TaskPlanningDemandDto> planningDemands,
    List<String> planningQuarterIds,
    List<String> planningSprintIds,
    Map<String, BigDecimal> loads,
    Map<String, Map<String, BigDecimal>> allocations,
    String releaseDateId,
    String initialQuarterId,
    Integer order,
    String createdAt,
    String updatedAt
) {
}
