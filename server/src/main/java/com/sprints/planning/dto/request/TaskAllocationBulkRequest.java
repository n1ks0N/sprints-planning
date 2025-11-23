package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record TaskAllocationBulkRequest(
    @NotNull String taskId,
    @NotNull String participantId,
    @NotNull Map<String, Integer> allocations
) {
}
