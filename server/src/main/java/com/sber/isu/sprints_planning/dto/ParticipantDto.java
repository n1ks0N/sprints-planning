package com.sber.isu.sprints_planning.dto;

public record ParticipantDto(
    String id,
    String fullName,
    String role,
    double rate
) {
}
