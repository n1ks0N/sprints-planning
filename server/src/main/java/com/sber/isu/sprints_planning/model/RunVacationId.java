package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class RunVacationId implements Serializable {

    @Column(name = "participant_id")
    private UUID participantId;

    @Column(name = "sprint_id")
    private UUID sprintId;

    public RunVacationId() {
    }

    public RunVacationId(UUID participantId, UUID sprintId) {
        this.participantId = participantId;
        this.sprintId = sprintId;
    }

    public UUID getParticipantId() {
        return participantId;
    }

    public void setParticipantId(UUID participantId) {
        this.participantId = participantId;
    }

    public UUID getSprintId() {
        return sprintId;
    }

    public void setSprintId(UUID sprintId) {
        this.sprintId = sprintId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        RunVacationId that = (RunVacationId) o;
        return Objects.equals(participantId, that.participantId) && Objects.equals(sprintId, that.sprintId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(participantId, sprintId);
    }
}
