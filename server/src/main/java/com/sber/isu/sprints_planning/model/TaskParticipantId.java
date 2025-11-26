package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TaskParticipantId implements Serializable {

    @Column(name = "task_id")
    private UUID taskId;

    @Column(name = "participant_id")
    private UUID participantId;

    public TaskParticipantId() {
    }

    public TaskParticipantId(UUID taskId, UUID participantId) {
        this.taskId = taskId;
        this.participantId = participantId;
    }

    public UUID getTaskId() {
        return taskId;
    }

    public void setTaskId(UUID taskId) {
        this.taskId = taskId;
    }

    public UUID getParticipantId() {
        return participantId;
    }

    public void setParticipantId(UUID participantId) {
        this.participantId = participantId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        TaskParticipantId that = (TaskParticipantId) o;
        return Objects.equals(taskId, that.taskId) && Objects.equals(participantId, that.participantId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(taskId, participantId);
    }
}
