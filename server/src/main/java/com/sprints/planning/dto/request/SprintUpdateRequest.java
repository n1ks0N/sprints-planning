package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record SprintUpdateRequest(
    @NotNull String id,
    String name,
    LocalDate startDate,
    LocalDate endDate,
    Integer workingDays,
    Integer order,
    String quarterId
) {
}
