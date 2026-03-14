package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ParticipantUpdateRequest(
    @NotNull String id,
    String fullName,
    String role,
    @Min(0) @Max(1) Double rate,
    List<String> userStreams,
    String jiraLogin
) {
}
