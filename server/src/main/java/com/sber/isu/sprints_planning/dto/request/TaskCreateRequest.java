package com.sber.isu.sprints_planning.dto.request;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record TaskCreateRequest(
    String title,
    String description,
    String dod,
    Short priority,
    String status,
    String customer,
    String stream,
    List<String> participantIds,
    Map<String, BigDecimal> loads,
    Map<String, Map<String, BigDecimal>> allocations,
    Map<String, String> notes,
    LocalDate releaseDate,
    String releaseSprintId,
    String leaderId,
    Integer order
) {
}
