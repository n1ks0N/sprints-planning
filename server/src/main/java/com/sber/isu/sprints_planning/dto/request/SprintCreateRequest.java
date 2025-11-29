package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record SprintCreateRequest(
    @NotNull String quarterId,
    @NotNull String name,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate,
    Integer workingDays,
    Integer order
) {
}
