package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record TaskParticipantRemoveDto(
    String taskId,
    List<String> participantIds,
    List<String> affectedSprintIds,
    Map<String, BigDecimal> loads,
    String leaderId,
    boolean removed,
    LocalDate updatedAt
) {
}
