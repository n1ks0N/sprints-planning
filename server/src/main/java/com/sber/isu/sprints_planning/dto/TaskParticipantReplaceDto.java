package com.sber.isu.sprints_planning.dto;

import java.time.LocalDate;
import java.util.List;

public record TaskParticipantReplaceDto(
    String taskId,
    List<String> participantIds,
    String fromParticipantId,
    String toParticipantId,
    String leaderId,
    boolean replaced,
    LocalDate updatedAt
) {
}
