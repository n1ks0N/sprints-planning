package com.sber.isu.sprints_planning.dto.request;

import java.util.List;

public record PlanningWorkbenchItemRequest(
    String title,
    String description,
    String dod,
    Short priority,
    List<String> customers,
    List<String> streams,
    List<TaskPlanningDemandRequest> planningDemands,
    String releaseDateId,
    String initialQuarterId,
    List<String> planningQuarterIds,
    List<String> planningSprintIds,
    Integer order
) {
}
