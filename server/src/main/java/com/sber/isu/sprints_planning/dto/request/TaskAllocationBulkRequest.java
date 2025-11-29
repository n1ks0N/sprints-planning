package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Map;

public record TaskAllocationBulkRequest(
    @NotNull String taskId,
    @NotNull String participantId,
    @NotNull Map<String, BigDecimal> allocations
) {
}
