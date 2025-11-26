package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record ReleaseUpdateRequest(
    @NotNull String id,
    String name,
    LocalDate promDate,
    String action,
    LocalDate psiDate,
    LocalDate opsStart,
    LocalDate opsEnd,
    LocalDate regressStart,
    LocalDate regressEnd,
    LocalDate ffDate,
    LocalDate ffInnerDate,
    LocalDate iftStart,
    LocalDate iftEnd,
    LocalDate buildDate,
    LocalDate crDate,
    LocalDate devStart,
    LocalDate devEnd,
    LocalDate stDate
) {
}
