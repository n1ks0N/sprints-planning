package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record TaskAllocationChangeRequest(
    @NotNull UUID participantId,
    @NotNull UUID sprintId,
    @NotNull BigDecimal days
) {
}
