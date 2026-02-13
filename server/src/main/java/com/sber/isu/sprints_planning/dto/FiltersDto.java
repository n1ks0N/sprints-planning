package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record FiltersDto(
    List<QuarterOption> quarters,
    List<String> statuses,
    List<Integer> priorities,
    List<String> streams,
    List<String> customers,
    List<ReleaseOption> releases
) {
    public record QuarterOption(String id, String name) {}
    public record ReleaseOption(String id, String promDate) {}
}
