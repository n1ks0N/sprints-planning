package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;

public record PlanningSessionParticipantLoadCellDto(
    String participantId,
    String sprintId,
    BigDecimal capacity,
    BigDecimal committed,
    BigDecimal draft,
    BigDecimal total,
    BigDecimal overload,
    BigDecimal free
) {
}
