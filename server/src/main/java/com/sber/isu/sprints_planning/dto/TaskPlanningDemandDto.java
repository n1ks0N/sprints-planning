package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;

public record TaskPlanningDemandDto(
    String kind,
    String role,
    String participantId,
    String stream,
    BigDecimal days
) {
}
