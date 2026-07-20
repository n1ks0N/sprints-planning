package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record ParticipantWorkloadTaskDto(
    String id,
    String title,
    short priority,
    String status,
    List<String> streams,
    String leaderId,
    Map<String, BigDecimal> allocations
) {
}
