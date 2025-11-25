package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record TaskAllocationRequest(
    @NotNull String taskId,
    @NotNull String participantId,
    @NotNull String sprintId,
    BigDecimal days
) {
}
