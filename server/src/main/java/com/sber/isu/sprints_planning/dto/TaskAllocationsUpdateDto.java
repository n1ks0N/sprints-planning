package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record TaskAllocationsUpdateDto(
    String taskId,
    List<TaskAllocationCellDto> cells,
    Map<String, BigDecimal> loads,
    LocalDate updatedAt
) {
}
