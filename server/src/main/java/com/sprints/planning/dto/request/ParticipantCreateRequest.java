package com.sprints.planning.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ParticipantCreateRequest(
    @NotBlank String fullName,
    @NotBlank String role,
    @NotNull @Min(0) @Max(1) Double rate
) {
}
