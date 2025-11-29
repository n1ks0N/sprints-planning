package com.sber.isu.sprints_planning.dto;

public record ReleaseDto(
    String id,
    String name,
    String promDate,
    String psiDate,
    String opsStart,
    String opsEnd,
    String regressStart,
    String regressEnd,
    String ffDate,
    String ffInnerDate,
    String iftStart,
    String iftEnd,
    String buildDate,
    String crDate,
    String devStart,
    String devEnd,
    String stDate,
    String createdAt,
    String updatedAt
) {
}
