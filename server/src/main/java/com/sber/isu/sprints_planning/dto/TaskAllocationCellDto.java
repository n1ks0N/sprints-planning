package com.sber.isu.sprints_planning.dto;

import java.math.BigDecimal;

public record TaskAllocationCellDto(String participantId, String sprintId, BigDecimal days) {
}
