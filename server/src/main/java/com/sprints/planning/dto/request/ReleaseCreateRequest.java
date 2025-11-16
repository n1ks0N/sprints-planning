package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record ReleaseCreateRequest(
    String name,
    @NotNull LocalDate promDate
) {
}
