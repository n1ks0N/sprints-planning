package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;

public record RunVacationUpsertRequest(
    @NotNull String participantId,
    @NotNull String sprintId,
    Integer runDays,
    Integer vacationNormDays
) {
}
