package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record TaskFiltersDto(
    List<QuarterDto> quarters,
    List<String> statuses,
    List<String> customers,
    List<String> streams
) {
}
