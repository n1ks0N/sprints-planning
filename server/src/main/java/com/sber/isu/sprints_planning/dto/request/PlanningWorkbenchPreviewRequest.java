package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PlanningWorkbenchPreviewRequest(
    String plannerType,
    @NotEmpty List<String> itemIds
) {
}
