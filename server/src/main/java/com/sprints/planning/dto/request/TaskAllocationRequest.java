package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;

public record TaskAllocationRequest(
    @NotNull String taskId,
    @NotNull String participantId,
    @NotNull String sprintId,
    Integer days
) {
}
