package com.sber.isu.sprints_planning.dto.request;

import java.math.BigDecimal;

public record TaskPlanningDemandRequest(
    String kind,
    String role,
    String participantId,
    String stream,
    BigDecimal days
) {
}
