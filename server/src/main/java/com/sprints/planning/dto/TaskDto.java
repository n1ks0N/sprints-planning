package com.sprints.planning.dto;

import java.util.List;
import java.util.Map;

public record TaskDto(
    String id,
    String title,
    String description,
    String dod,
    short priority,
    String customer,
    String stream,
    List<String> participantIds,
    Map<String, Integer> loads,
    Map<String, Map<String, Integer>> allocations,
    Map<String, String> notes,
    String releaseDate,
    String releaseSprintId,
    String leaderId,
    String createdAt,
    String updatedAt
) {
}
