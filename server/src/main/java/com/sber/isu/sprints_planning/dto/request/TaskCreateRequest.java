package com.sber.isu.sprints_planning.dto.request;

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
    List<String> planningQuarterIds,
    List<String> planningSprintIds,
    Map<String, java.math.BigDecimal> loads,
    Map<String, Map<String, java.math.BigDecimal>> allocations,
    Map<String, String> notes,
    String releaseDateId,
    String initialQuarterId,
    String leaderId,
    Integer order,
    String workspace,
    String releasePromDate
) {

    public TaskCreateRequest(String title, String description, String dod, Short priority, String status, List<String> customers, List<String> streams, List<String> participantIds, List<String> planningQuarterIds, List<String> planningSprintIds, Map<String, java.math.BigDecimal> loads, Map<String, Map<String, java.math.BigDecimal>> allocations, Map<String, String> notes, String releaseDateId, String initialQuarterId, String leaderId, Integer order) {
        this(title, description, dod, priority, status, customers, streams, participantIds, planningQuarterIds, planningSprintIds, loads, allocations, notes, releaseDateId, initialQuarterId, leaderId, order, null, null);
    }
}
