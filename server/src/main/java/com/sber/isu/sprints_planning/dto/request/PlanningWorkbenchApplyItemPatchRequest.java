package com.sber.isu.sprints_planning.dto.request;

import java.util.List;
import java.util.Map;

public record PlanningWorkbenchApplyItemPatchRequest(
    String title,
    String description,
    String dod,
    Short priority,
    String status,
    List<String> customers,
    List<String> streams,
    List<String> participantIds,
    List<TaskPlanningDemandRequest> planningDemands,
    String releaseDateId,
    String initialQuarterId,
    List<String> planningQuarterIds,
    List<String> planningSprintIds,
    Map<String, String> notes,
    String leaderId,
    Integer order
) {
}
