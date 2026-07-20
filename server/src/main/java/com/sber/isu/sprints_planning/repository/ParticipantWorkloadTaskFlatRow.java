package com.sber.isu.sprints_planning.repository;

import java.math.BigDecimal;
import java.util.UUID;

public record ParticipantWorkloadTaskFlatRow(
    UUID participantId,
    UUID taskId,
    String title,
    short priority,
    String status,
    UUID leaderId,
    String stream,
    UUID sprintId,
    BigDecimal days
) {
}
