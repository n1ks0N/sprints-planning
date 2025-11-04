package com.sprints.planning.dto.request;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record TaskCreateRequest(
    String title,
    String dod,
    Short priority,
    String customer,
    String stream,
    List<String> participantIds,
    Map<String, Integer> loads,
    Map<String, Map<String, Integer>> allocations,
    Map<String, String> notes,
    LocalDate releaseDate,
    String releaseSprintId
) {
}
