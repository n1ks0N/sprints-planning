package com.sber.isu.sprints_planning.dto;

import java.time.LocalDate;
import java.util.List;

public record TaskParticipantsUpdateDto(
    String taskId,
    List<String> participantIds,
    boolean added,
    LocalDate updatedAt
) {
}
