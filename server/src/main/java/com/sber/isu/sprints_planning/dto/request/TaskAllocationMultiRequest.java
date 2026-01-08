package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Map;

public record TaskAllocationMultiRequest(
    @NotNull String taskId,
    @NotNull Map<String, Map<String, BigDecimal>> allocations
) {
}
