package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record PlanningWorkbenchApplyRequest(
    @NotEmpty List<String> itemIds,
    Map<String, Map<String, Map<String, BigDecimal>>> allocations,
    Map<String, PlanningWorkbenchApplyItemPatchRequest> itemPatches
) {
}
