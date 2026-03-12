package com.sber.isu.sprints_planning.dto.request;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record TaskCreateRequest(
    String title,
    String description,
    String dod,
    Short priority,
    String status,
    List<String> customers,
    List<String> streams,
    List<String> participantIds,
    Map<String, BigDecimal> loads,
    Map<String, Map<String, BigDecimal>> allocations,
    Map<String, String> notes,
    String releaseDateId,
    String initialQuarterId,
    String leaderId,
    Integer order
) {
}
