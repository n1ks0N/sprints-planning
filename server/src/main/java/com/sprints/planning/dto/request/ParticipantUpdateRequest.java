package com.sprints.planning.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ParticipantUpdateRequest(
    @NotNull String id,
    String fullName,
    String role,
    @Min(0) @Max(1) Double rate
) {
}
