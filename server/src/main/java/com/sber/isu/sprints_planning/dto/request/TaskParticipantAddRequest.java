package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotBlank;

public record TaskParticipantAddRequest(@NotBlank String participantId) {
}
