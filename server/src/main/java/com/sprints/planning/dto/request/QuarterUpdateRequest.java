package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record QuarterUpdateRequest(
    @NotNull String id,
    Integer year,
    Short number,
    String name,
    LocalDate startDate,
    LocalDate endDate
) {
}
