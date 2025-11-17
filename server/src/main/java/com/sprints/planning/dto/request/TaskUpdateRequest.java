package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record TaskUpdateRequest(
    @NotNull String id,
    String title,
    String description,
    String dod,
    Short priority,
    String customer,
    String stream,
    List<String> participantIds,
    Map<String, Integer> loads,
    Map<String, Map<String, Integer>> allocations,
    Map<String, String> notes,
    LocalDate releaseDate,
    String releaseSprintId,
    String leaderId
) {
}
