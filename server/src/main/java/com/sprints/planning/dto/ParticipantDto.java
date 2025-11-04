package com.sprints.planning.dto;

public record ParticipantDto(
    String id,
    String fullName,
    String role,
    double rate
) {
}
