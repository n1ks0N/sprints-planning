package com.sprints.planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class TaskAllocationId implements Serializable {

    @Column(name = "task_id")
    private UUID taskId;

    @Column(name = "participant_id")
    private UUID participantId;

    @Column(name = "sprint_id")
    private UUID sprintId;

    public TaskAllocationId() {
    }

    public TaskAllocationId(UUID taskId, UUID participantId, UUID sprintId) {
        this.taskId = taskId;
        this.participantId = participantId;
        this.sprintId = sprintId;
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
        TaskAllocationId that = (TaskAllocationId) o;
        return Objects.equals(taskId, that.taskId)
            && Objects.equals(participantId, that.participantId)
            && Objects.equals(sprintId, that.sprintId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(taskId, participantId, sprintId);
    }
}
