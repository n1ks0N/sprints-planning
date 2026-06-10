package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record PlanningWorkbenchPreviewDto(
    List<String> selectedItemIds,
    List<String> sprintIds,
    PlanningSessionSolveSummaryDto summary,
    List<String> warnings,
    List<PlanningWorkbenchItemDto> items,
    List<PlanningSessionParticipantLoadRowDto> participantSummary,
    boolean canApply
) {
}
