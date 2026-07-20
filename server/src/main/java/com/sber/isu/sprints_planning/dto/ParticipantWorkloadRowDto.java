package com.sber.isu.sprints_planning.dto;

import java.util.List;

public record ParticipantWorkloadRowDto(
    ParticipantWorkloadParticipantDto participant,
    List<ParticipantWorkloadTaskDto> tasks
) {
}
