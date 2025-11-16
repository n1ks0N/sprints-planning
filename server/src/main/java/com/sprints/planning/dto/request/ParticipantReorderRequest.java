package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ParticipantReorderRequest(
    @NotEmpty List<ParticipantOrderDto> orders
) {

    public record ParticipantOrderDto(String id, int order) {
    }
}
