package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ParticipantCreateRequest(
    @NotBlank String fullName,
    @NotBlank String role,
    @NotNull @Min(0) @Max(1) Double rate,
    List<String> userStreams,
    String jiraLogin
) {
}
