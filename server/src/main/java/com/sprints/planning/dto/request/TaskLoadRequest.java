package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record TaskLoadRequest(
    @NotNull String taskId,
    @NotNull String sprintId,
    BigDecimal days
) {
}
