package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record TaskUpdateRequest(
    @NotNull String id,
    String title,
    String description,
    String dod,
    Short priority,
    String status,
    List<String> customer,
    List<String> stream,
    List<String> participantIds,
    Map<String, BigDecimal> loads,
    Map<String, Map<String, BigDecimal>> allocations,
    Map<String, String> notes,
    String releaseDateId,
    String leaderId,
    Integer order
) {
}
