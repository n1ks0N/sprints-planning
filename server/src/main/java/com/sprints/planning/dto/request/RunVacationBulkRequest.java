package com.sprints.planning.dto.request;

import java.util.List;

public record RunVacationBulkRequest(
    String quarterId,
    List<String> roles,
    Integer daysPerSprint,
    Boolean multiplyByRate
) {
}
