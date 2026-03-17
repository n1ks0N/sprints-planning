package com.sber.isu.sprints_planning.dto;

public record JiraExportBatchStartDto(
    String batchId,
    String status,
    int totalItems
) {
}
