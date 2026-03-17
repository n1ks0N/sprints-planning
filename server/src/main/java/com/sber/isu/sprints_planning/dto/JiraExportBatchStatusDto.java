package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record JiraExportBatchStatusDto(
    String batchId,
    String status,
    int totalItems,
    int processedItems,
    int createdItems,
    int failedItems,
    int skippedItems,
    int manualCheckItems,
    List<JiraExportBatchItemDto> items
) {
}
