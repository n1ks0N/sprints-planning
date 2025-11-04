package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record QuarterCreateRequest(
    @NotNull Integer year,
    @NotNull Short number,
    @Size(min = 1) String name,
    @NotNull LocalDate startDate,
    @NotNull LocalDate endDate
) {
}
