package com.sber.isu.sprints_planning.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record ApiSessionHistoryDto(
    String sessionId,
    String userName,
    OffsetDateTime lastActionAt,
    List<ApiCallHistoryDto> actions
) {
}
