package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;

public record TaskLoadRequest(
    @NotNull String taskId,
    @NotNull String sprintId,
    Integer days
) {
}
